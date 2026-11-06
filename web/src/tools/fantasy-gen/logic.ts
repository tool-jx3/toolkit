/**
 * 奇幻隨機產生器的純邏輯（不依賴 React）：設定與結果的型別、一批的產生（鎖定的留著、同一個種子同一批）、
 * 一張卡或一欄的重抽、複製與匯出的文字、讀回存檔與專案檔時的整理。抽法在 engine.ts，產生器在 generators.ts。
 */
import { type CcfoliaCharacterData, serializeCharacterClipboard } from '@/ccfolia/characterData';
import { toCsv } from '@/core/csv';
import { randomSeed, seededRandom } from '@/core/names';
import { type CorpusData, corpusPack, drawCorpusName } from '@/core/names/corpus';
import type { NamePack } from './data/own';
import {
  capitalize,
  partsText,
  pickEntry,
  type Rng,
  type RolledPart,
  rollTemplate,
} from './engine';
import {
  COUNT_MAX,
  CUSTOM_PREFIX,
  type CustomGenerator,
  customGenerator,
  type FantasyNames,
  GENERATORS,
  type GenEnv,
  type GeneratorDef,
  type GenOptions,
  generatorById,
  isCustomId,
  optionValue,
} from './generators';
import { S } from './strings';

export const TOOL_ID = 'fantasy-gen';
/** 專案檔的版本 */
export const DATA_VERSION = 1;
/** 紀錄最多留幾批 */
export const HISTORY_MAX = 20;
/** 我的清單最多幾筆 */
export const SAVED_MAX = 500;
/** 自訂產生器最多幾個、每個的文字最多幾個字 */
export const CUSTOM_MAX = 30;
export const CUSTOM_TEXT_MAX = 50_000;

/* ---------- 型別 ---------- */

export interface ResultCard {
  /** 卡片的 id（同一批裡不重複） */
  id: string;
  /** 產生這一筆的產生器 */
  gen: string;
  /** 用了第幾種範本 */
  variant: number;
  parts: RolledPart[];
  /** 鎖住整張：再產生時留著 */
  locked: boolean;
  /** 鎖定的欄（欄的鍵）：重抽這張時留著 */
  lockedFields: string[];
}

export interface SavedItem {
  id: string;
  gen: string;
  /** 存的時候的產生器名稱（自訂的刪掉之後還看得到） */
  label: string;
  parts: RolledPart[];
  at: number;
}

export interface GenState {
  /** 目前的產生器 */
  gen: string;
  /** 各產生器的條件 */
  options: Record<string, Record<string, string>>;
  /** 各產生器一次產生幾筆 */
  counts: Record<string, number>;
  seed: string;
  lastSeed: string;
  results: ResultCard[];
  saved: SavedItem[];
  customs: CustomGenerator[];
}

export const initialState: GenState = {
  gen: 'npc',
  options: {},
  counts: {},
  seed: '',
  lastSeed: '',
  results: [],
  saved: [],
  customs: [],
};

export interface HistoryEntry {
  id: string;
  at: number;
  gen: string;
  label: string;
  /** 那一批的條件（文字） */
  detail: string;
  seed: string;
  results: { gen: string; variant: number; parts: RolledPart[] }[];
}

/* ---------- 產生器 ---------- */

/** 目前可以選的產生器：內建的＋自訂的 */
export function allGenerators(state: Pick<GenState, 'customs'>): GeneratorDef[] {
  return [...GENERATORS, ...state.customs.map(customGenerator)];
}

export function findGenerator(
  state: Pick<GenState, 'customs'>,
  id: string,
): GeneratorDef | undefined {
  if (isCustomId(id)) {
    const c = state.customs.find((x) => `${CUSTOM_PREFIX}${x.id}` === id);
    return c ? customGenerator(c) : undefined;
  }
  return generatorById(id);
}

export function currentGenerator(state: GenState): GeneratorDef {
  return findGenerator(state, state.gen) ?? GENERATORS[0];
}

export function optionsOf(state: GenState, id: string): GenOptions {
  return state.options[id] ?? {};
}

export function countOf(state: GenState, def: GeneratorDef): number {
  const n = state.counts[def.id];
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.max(1, Math.min(COUNT_MAX, Math.round(n)))
    : def.defaultCount;
}

/** 條件的文字（紀錄與窄畫面的摘要）：「1～4 級・SRD 5.2（2024 年版）」 */
export function optionsLabel(def: GeneratorDef, options: GenOptions): string {
  return def.options
    .map((o) => o.choices.find((c) => c.value === optionValue(def, options, o.key))?.label ?? '')
    .filter(Boolean)
    .join('・');
}

/** 名字（弄墨 Inknomu 的奇幻語料）：包是 fantasy-<人類／精靈…> */
export function fantasyNames(data: CorpusData): FantasyNames {
  return {
    draw(pack: NamePack, rng: Rng) {
      const p = corpusPack(data, `fantasy-${pack}`) ?? corpusPack(data, 'fantasy-human');
      return p ? drawCorpusName(p, { gender: 'any' }, rng, 'fantasy').text : S.out.noName;
    },
  };
}

/* ---------- 抽 ---------- */

export interface RollCardInput {
  def: GeneratorDef;
  options: GenOptions;
  env: GenEnv;
  rng: Rng;
  /** 留著的欄（鍵 → 值） */
  keep?: Readonly<Record<string, string>>;
  /** 用哪一種範本（鎖定了欄時照原本那一種） */
  variant?: number;
  /** 重抽前的這一筆 */
  prev?: readonly RolledPart[];
  /** 這次找不到的表等（自訂產生器的提示） */
  issues?: Set<string>;
}

/** 抽一筆：範本（或產生器自己的抽法）展開一次 */
export function rollCard({
  def,
  options,
  env,
  rng,
  keep = {},
  variant,
  prev,
  issues,
}: RollCardInput): { variant: number; parts: RolledPart[] } {
  const built = def.build(options, env);
  if (built.roll) return { variant: 0, parts: built.roll({ rng, keep, prev }) };
  if (!built.templates.length) return { variant: 0, parts: [] };
  let v = variant !== undefined && variant >= 0 && variant < built.templates.length ? variant : -1;
  if (v < 0) {
    const chosen = pickEntry(built.templates, rng);
    v = chosen ? built.templates.indexOf(chosen) : 0;
  }
  const parts = rollTemplate(
    built.templates[v].text,
    { tables: built.tables, fns: built.fns, rng, issues },
    { order: built.order, keep },
  );
  return { variant: v, parts };
}

/** 一張卡的欄（有名字的；同一個鍵只列一次） */
export function cardFields(parts: readonly RolledPart[]): { key: string; label: string }[] {
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];
  for (const p of parts) {
    if (p.k && p.l && !seen.has(p.k)) {
      seen.add(p.k);
      out.push({ key: p.k, label: p.l });
    }
  }
  return out;
}

/** 欄的值（鍵 → 值） */
export function fieldValues(
  parts: readonly RolledPart[],
  keys?: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of parts) if (p.k && (!keys || keys.includes(p.k))) out[p.k] = p.t;
  return out;
}

export function cardText(card: Pick<ResultCard, 'parts'>): string {
  return partsText(card.parts);
}

/**
 * 畫面上的一行一行（和 partsText 一樣：每行去掉頭尾空白、空行拿掉、第一個英文字母大寫），每行是幾段字與欄；
 * 一個欄的值有好幾行時（寶藏的魔法物品）每一行都是那個欄。
 */
export function partLines(parts: readonly RolledPart[]): RolledPart[][] {
  const lines: RolledPart[][] = [[]];
  for (const p of parts) {
    p.t.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ ...p, t: piece });
    });
  }
  const out = lines
    .map((line) => {
      const l = line.map((p) => ({ ...p }));
      if (l.length) {
        l[0].t = l[0].t.trimStart();
        l[l.length - 1].t = l[l.length - 1].t.trimEnd();
      }
      return l.filter((p) => p.t);
    })
    .filter((l) => l.length);
  if (out[0]?.[0]) out[0][0] = { ...out[0][0], t: capitalize(out[0][0].t) };
  return out;
}

let cardSerial = 0;
/** 新卡片的 id */
export function newCardId(seed: string, index: number): string {
  cardSerial = (cardSerial + 1) % 1_000_000;
  return `${seed}-${index}-${cardSerial.toString(36)}`;
}

export interface BatchInput {
  def: GeneratorDef;
  options: GenOptions;
  env: GenEnv;
  count: number;
  /** 種子（空白時隨機產生一個） */
  seed: string;
  /** 目前的結果（鎖住整張的留在原位） */
  current?: readonly ResultCard[];
  random?: () => number;
}

export interface BatchResult {
  seed: string;
  results: ResultCard[];
  issues: string[];
}

/**
 * 產生一批：同一個種子、產生器、條件、數量（與同樣位置的鎖定）結果相同。
 * 鎖住整張的卡留在原位（數量變少時，排在後面的鎖定卡接在最後，不會被丟掉）；其他位置依序用同一個亂數流抽。
 */
export function generateBatch({
  def,
  options,
  env,
  count,
  seed,
  current = [],
  random = Math.random,
}: BatchInput): BatchResult {
  const used = seed.trim() || randomSeed(random);
  const rng = seededRandom(used);
  const issues = new Set<string>();
  const n = Math.max(1, Math.min(COUNT_MAX, Math.round(count)));
  const results: ResultCard[] = [];
  for (let i = 0; i < n; i++) {
    const old = current[i];
    if (old?.locked) {
      results.push(old);
      continue;
    }
    const { variant, parts } = rollCard({ def, options, env, rng, issues });
    results.push({
      id: newCardId(used, i),
      gen: def.id,
      variant,
      parts,
      locked: false,
      lockedFields: [],
    });
  }
  for (const old of current.slice(n)) if (old.locked) results.push(old);
  return { seed: used, results, issues: [...issues] };
}

/** 重抽一張（鎖定的欄留著；有鎖定的欄時照原本的範本） */
export function rerollCard(
  card: ResultCard,
  def: GeneratorDef,
  options: GenOptions,
  env: GenEnv,
  rng: Rng,
): ResultCard {
  const keep = fieldValues(card.parts, card.lockedFields);
  const { variant, parts } = rollCard({
    def,
    options,
    env,
    rng,
    keep,
    variant: card.lockedFields.length ? card.variant : undefined,
  });
  return { ...card, variant, parts };
}

/** 只重抽一欄（其他欄照舊、範本照舊） */
export function rerollField(
  card: ResultCard,
  key: string,
  def: GeneratorDef,
  options: GenOptions,
  env: GenEnv,
  rng: Rng,
): ResultCard {
  const keys = cardFields(card.parts)
    .map((f) => f.key)
    .concat(card.parts.flatMap((p) => (p.k && !p.l ? [p.k] : [])))
    .filter((k) => k !== key);
  const keep = fieldValues(card.parts, keys);
  const { parts } = rollCard({
    def,
    options,
    env,
    rng,
    keep,
    variant: card.variant,
    prev: card.parts,
  });
  return { ...card, parts };
}

/* ---------- 文字 ---------- */

/** 一批的文字：一行一筆；一大塊的（寶藏、法術書）之間空一行 */
export function batchText(cards: readonly Pick<ResultCard, 'parts'>[]): string {
  const texts = cards.map(cardText).filter(Boolean);
  return texts.some((t) => t.includes('\n')) ? texts.join('\n\n') : texts.join('\n');
}

/** CCFOLIA 棋子的剪貼簿 JSON：名稱是名字那一欄（NPC、委託人）或產生器的名稱，全文放備註 */
export function ccfoliaCharacter(
  card: Pick<ResultCard, 'parts'>,
  def: GeneratorDef | undefined,
): string {
  const title = def?.titleField
    ? card.parts.find((p) => p.l === def.titleField)?.t.trim()
    : undefined;
  const data: CcfoliaCharacterData = {
    name: title || def?.label || S.out.noName,
    memo: cardText(card),
  };
  return serializeCharacterClipboard(data);
}

/** CSV：產生器、全文，再來是每一欄（照第一次出現的順序） */
export function csvText(
  cards: readonly Pick<ResultCard, 'parts' | 'gen'>[],
  labelOf: (gen: string) => string,
): string {
  const labels: string[] = [];
  for (const c of cards)
    for (const f of cardFields(c.parts)) if (!labels.includes(f.label)) labels.push(f.label);
  const rows = cards.map((c) => {
    const byLabel = new Map<string, string>();
    for (const p of c.parts) if (p.l && !byLabel.has(p.l)) byLabel.set(p.l, p.t);
    return [labelOf(c.gen), cardText(c), ...labels.map((l) => byLabel.get(l) ?? '')];
  });
  return toCsv([['產生器', '全文', ...labels], ...rows], { bom: true, guard: true });
}

/** 匯出的檔名：「奇幻隨機產生器_NPC_20261106-1430.txt」 */
export function exportFileName(label: string, ext: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const safe = label.replace(/[\\/:*?"<>|\s]+/g, '_');
  return `奇幻隨機產生器_${safe}_${stamp}.${ext}`;
}

/* ---------- 紀錄 ---------- */

export function pushHistory(history: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history.filter((h) => h.id !== entry.id)].slice(0, HISTORY_MAX);
}

/* ---------- 讀回存檔、專案檔 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function sanitizeParts(v: unknown): RolledPart[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) => {
    if (!isObj(p) || typeof p.t !== 'string') return [];
    const part: RolledPart = { t: p.t };
    if (typeof p.k === 'string' && p.k) part.k = p.k;
    if (part.k && typeof p.l === 'string' && p.l) part.l = p.l;
    return [part];
  });
}

function sanitizeCard(v: unknown, i: number): ResultCard | null {
  if (!isObj(v)) return null;
  const parts = sanitizeParts(v.parts);
  if (!parts.length) return null;
  const keys = new Set(parts.flatMap((p) => (p.k ? [p.k] : [])));
  return {
    id: str(v.id) || `card-${i}`,
    gen: str(v.gen, 'npc'),
    variant: typeof v.variant === 'number' && Number.isInteger(v.variant) ? v.variant : 0,
    parts,
    locked: v.locked === true,
    lockedFields: Array.isArray(v.lockedFields)
      ? [
          ...new Set(
            v.lockedFields.filter((k): k is string => typeof k === 'string' && keys.has(k)),
          ),
        ]
      : [],
  };
}

function sanitizeSaved(v: unknown, i: number): SavedItem | null {
  if (!isObj(v)) return null;
  const parts = sanitizeParts(v.parts);
  if (!parts.length) return null;
  return {
    id: str(v.id) || `saved-${i}`,
    gen: str(v.gen),
    label: str(v.label),
    parts,
    at: typeof v.at === 'number' && Number.isFinite(v.at) ? v.at : 0,
  };
}

function sanitizeCustom(v: unknown, i: number): CustomGenerator | null {
  if (!isObj(v)) return null;
  const id = str(v.id).replace(/[^\w-]/g, '') || `c${i + 1}`;
  return {
    id,
    name: str(v.name).slice(0, 60) || S.custom.newName(i + 1),
    text: str(v.text).slice(0, CUSTOM_TEXT_MAX),
  };
}

function uniqueIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    let id = it.id;
    while (seen.has(id)) id = `${it.id}-${i}`;
    seen.add(id);
    return id === it.id ? it : { ...it, id };
  });
}

/** 讀回的資料（舊版、手改過、別的檔）整理成合用的設定 */
export function sanitizeState(v: unknown): GenState {
  if (!isObj(v)) return { ...initialState };
  const customs = uniqueIds(
    (Array.isArray(v.customs) ? v.customs : [])
      .map(sanitizeCustom)
      .filter((c): c is CustomGenerator => c !== null)
      .slice(0, CUSTOM_MAX),
  );
  const options: Record<string, Record<string, string>> = {};
  if (isObj(v.options)) {
    for (const [gen, o] of Object.entries(v.options)) {
      if (!isObj(o)) continue;
      const clean: Record<string, string> = {};
      for (const [k, val] of Object.entries(o)) if (typeof val === 'string') clean[k] = val;
      options[gen] = clean;
    }
  }
  const counts: Record<string, number> = {};
  if (isObj(v.counts)) {
    for (const [gen, n] of Object.entries(v.counts)) {
      if (typeof n === 'number' && Number.isFinite(n))
        counts[gen] = Math.max(1, Math.min(COUNT_MAX, Math.round(n)));
    }
  }
  const state: GenState = {
    gen: str(v.gen, initialState.gen),
    options,
    counts,
    seed: str(v.seed).slice(0, 100),
    lastSeed: str(v.lastSeed).slice(0, 100),
    results: uniqueIds(
      (Array.isArray(v.results) ? v.results : [])
        .map(sanitizeCard)
        .filter((c): c is ResultCard => c !== null)
        .slice(0, COUNT_MAX * 2),
    ),
    saved: uniqueIds(
      (Array.isArray(v.saved) ? v.saved : [])
        .map(sanitizeSaved)
        .filter((c): c is SavedItem => c !== null)
        .slice(0, SAVED_MAX),
    ),
    customs,
  };
  if (!findGenerator(state, state.gen)) state.gen = initialState.gen;
  return state;
}

export function sanitizeHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .flatMap((e): HistoryEntry[] => {
      if (!isObj(e) || !Array.isArray(e.results)) return [];
      const results = e.results.flatMap((r) => {
        if (!isObj(r)) return [];
        const parts = sanitizeParts(r.parts);
        return parts.length
          ? [
              {
                gen: str(r.gen, str(e.gen)),
                variant: typeof r.variant === 'number' ? r.variant : 0,
                parts,
              },
            ]
          : [];
      });
      if (!results.length) return [];
      return [
        {
          id: str(e.id) || `h-${str(e.seed)}`,
          at: typeof e.at === 'number' ? e.at : 0,
          gen: str(e.gen),
          label: str(e.label),
          detail: str(e.detail),
          seed: str(e.seed),
          results,
        },
      ];
    })
    .slice(0, HISTORY_MAX);
}

/** 專案檔的內容：設定、目前的結果、我的清單、自訂產生器 */
export function projectData(state: GenState): GenState {
  return sanitizeState(state);
}

/** 自訂產生器的新 id */
export function newCustomId(customs: readonly CustomGenerator[]): string {
  let n = customs.length + 1;
  while (customs.some((c) => c.id === `c${n}`)) n++;
  return `c${n}`;
}
