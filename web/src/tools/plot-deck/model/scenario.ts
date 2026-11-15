/**
 * 一份劇本（骨架）：抽到的卡、鎖定、回答、改寫的問題、PC 與 NPC、場景與線索。
 * 純資料與小工具（不依賴 React）；抽卡的規則在 draw.ts、場景與線索在 plot.ts。
 */
import {
  type Card,
  type CardCat,
  type Deck,
  type DeckId,
  findCard,
  findTone,
  getDeck,
} from '../data';
import { S } from '../strings';

/** 故事的卡（不含 PC 的卡），依「抽的順序」以外的顯示順序：核心、骨架、舞台 */
export const STORY_KEYS = [
  'core',
  'intro',
  'obstacle',
  'truth',
  'ending',
  'stage',
  'tone',
  'clue',
  'npc',
] as const;
export type StoryKey = (typeof STORY_KEYS)[number];
/** 故事的骨架（導入 → 障礙 → 真相 → 結局） */
export const FLOW_KEYS: readonly StoryKey[] = ['intro', 'obstacle', 'truth', 'ending'];
/** 舞台與氣氛卡的一組 */
export const STAGE_KEYS: readonly StoryKey[] = ['stage', 'tone', 'clue', 'npc'];
/** 回答問題的順序（先真相，再舞台，最後故事的流程） */
export const ANSWER_GROUPS: readonly (readonly StoryKey[])[] = [
  ['core', 'truth'],
  ['stage', 'tone', 'clue', 'npc'],
  ['intro', 'obstacle', 'ending'],
];

export const PC_MAX = 4;
export const PC_MIN = 1;
export const relKey = (i: number): string => `rel${i}`;
export const secKey = (i: number): string => `sec${i}`;
export const ALL_KEYS: readonly string[] = [
  ...STORY_KEYS,
  ...[1, 2, 3, 4].map(relKey),
  ...[1, 2, 3, 4].map(secKey),
];

export type Phase = 'start' | 'setup' | 'done';
export type SetupStep = 'core' | 'cards';
export type Step = 'cards' | 'cast' | 'answers' | 'plot' | 'sheet';
export const STEPS: readonly Step[] = ['cards', 'cast', 'answers', 'plot', 'sheet'];
export type MadeBy = 'random' | 'setup' | 'catalog';

export interface Slot {
  card: string | null;
  locked: boolean;
}

/** 回答或改寫的問題：只在同一張卡還在欄上時有效 */
export interface Written {
  card: string;
  text: string;
}

export interface PcInfo {
  /** 稱呼 */
  name: string;
  /** 立場 */
  role: string;
  /** 關係的對象：`pc2`、`npc`、追加的 NPC 的 id；null＝預設（PC1 → PC2 → … → PC1） */
  target: string | null;
}

export interface ExtraNpc {
  id: string;
  name: string;
  role: string;
  tie: string;
}

export interface Deduction {
  id: string;
  text: string;
}

export interface Scene {
  id: string;
  name: string;
  place: string;
  what: string;
}

export interface Clue {
  id: string;
  text: string;
  /** 取得的方法（檢定、條件、問誰） */
  how: string;
  /** 放在哪個場景（id；空字串＝還沒決定） */
  scene: string;
  /** 連到哪些推理（id） */
  links: string[];
}

export interface Plot {
  deductions: Deduction[];
  scenes: Scene[];
  clues: Clue[];
}

export interface Scenario {
  id: string;
  created: number;
  updated: number;
  /** 自己取的劇本名（空白＝用卡片組出來的名字） */
  title: string;
  deck: DeckId;
  /** 題材、氣氛（null＝還沒決定，抽的時候交給系統） */
  mission: string | null;
  tone: string | null;
  madeBy: MadeBy | null;
  phase: Phase;
  setupStep: SetupStep;
  /** 「照條件抽」發的三張體驗的核心 */
  coreDeal: string[];
  step: Step;
  pcCount: number;
  useSecrets: boolean;
  slots: Record<string, Slot>;
  pcs: PcInfo[];
  npc: { name: string; tie: string };
  extras: ExtraNpc[];
  answers: Record<string, Written>;
  questions: Record<string, Written>;
  plot: Plot;
}

let serial = 0;
/** 新的 id（時間＋流水號＋亂數；只要在這份資料裡不重複） */
export function uid(prefix: string, now = Date.now()): string {
  serial = (serial + 1) % 1296;
  return `${prefix}${now.toString(36)}${serial.toString(36).padStart(2, '0')}${Math.floor(
    Math.random() * 1296,
  )
    .toString(36)
    .padStart(2, '0')}`;
}

export const emptyPlot = (): Plot => ({ deductions: [], scenes: [], clues: [] });
export const emptyPc = (): PcInfo => ({ name: '', role: '', target: null });

export function emptySlots(): Record<string, Slot> {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, { card: null, locked: false }]));
}

export function newScenario(
  deck: DeckId,
  options: Partial<Pick<Scenario, 'mission' | 'tone' | 'pcCount' | 'useSecrets'>> = {},
  now = Date.now(),
): Scenario {
  return {
    id: uid('s', now),
    created: now,
    updated: now,
    title: '',
    deck,
    mission: options.mission ?? null,
    tone: options.tone ?? null,
    madeBy: null,
    phase: 'start',
    setupStep: 'core',
    coreDeal: [],
    step: 'cards',
    pcCount: options.pcCount ?? 2,
    useSecrets: options.useSecrets ?? true,
    slots: emptySlots(),
    pcs: Array.from({ length: PC_MAX }, emptyPc),
    npc: { name: '', tie: '' },
    extras: [],
    answers: {},
    questions: {},
    plot: emptyPlot(),
  };
}

/** 欄的卡的種類 */
export function slotCat(key: string): CardCat {
  if (key.startsWith('rel')) return 'relation';
  if (key.startsWith('sec')) return 'secret';
  return key as CardCat;
}

/** PC 的編號（rel2 → 2；不是 PC 的欄 → 0） */
export function slotOwner(key: string): number {
  const m = /^(?:rel|sec)(\d)$/.exec(key);
  return m ? Number(m[1]) : 0;
}

export const isPcKey = (key: string): boolean => slotOwner(key) > 0;

/** 這份劇本用到的 PC 的欄（關係、秘密） */
export function pcKeys(sc: Pick<Scenario, 'pcCount' | 'useSecrets'>, pc?: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= sc.pcCount; i++) {
    if (pc && pc !== i) continue;
    out.push(relKey(i));
    if (sc.useSecrets) out.push(secKey(i));
  }
  return out;
}

/** 這份劇本用到的全部的欄 */
export function activeKeys(sc: Pick<Scenario, 'pcCount' | 'useSecrets'>): string[] {
  return [...STORY_KEYS, ...pcKeys(sc)];
}

export const deckOf = (sc: Pick<Scenario, 'deck'>): Deck => getDeck(sc.deck);

export function slotCard(deck: Deck, sc: Scenario, key: string): Card | null {
  return findCard(deck, sc.slots[key]?.card);
}

/** 回答（卡換掉了就不算） */
export function answerOf(sc: Scenario, key: string): string {
  const a = sc.answers[key];
  const card = sc.slots[key]?.card;
  return a && card && a.card === card ? a.text : '';
}

export function questionEdited(sc: Scenario, key: string): boolean {
  const q = sc.questions[key];
  const card = sc.slots[key]?.card;
  return !!(q && card && q.card === card);
}

/** 問題（改寫過就是改寫的） */
export function questionOf(deck: Deck, sc: Scenario, key: string): string {
  const card = slotCard(deck, sc, key);
  if (!card) return '';
  return questionEdited(sc, key) ? sc.questions[key].text : card.question;
}

export function setAnswer(sc: Scenario, key: string, text: string): void {
  const card = sc.slots[key]?.card;
  if (card && text.trim()) sc.answers[key] = { card, text };
  else delete sc.answers[key];
}

/** 改寫問題；和原本一樣或空白＝回到原本的問題 */
export function setQuestion(deck: Deck, sc: Scenario, key: string, text: string): void {
  const card = slotCard(deck, sc, key);
  const t = text.trim();
  if (card && t && t !== card.question) sc.questions[key] = { card: card.id, text: t };
  else delete sc.questions[key];
}

/** 換卡：回答與改寫的問題跟著那張卡，換掉就清掉 */
export function setSlotCard(sc: Scenario, key: string, card: string | null): void {
  const slot = sc.slots[key] ?? { card: null, locked: false };
  slot.card = card;
  sc.slots[key] = slot;
  if (sc.answers[key] && sc.answers[key].card !== card) delete sc.answers[key];
  if (sc.questions[key] && sc.questions[key].card !== card) delete sc.questions[key];
}

/** 回答過的欄（已有卡的） */
export function answeredKeys(sc: Scenario, keys: readonly string[]): string[] {
  return keys.filter((k) => !!answerOf(sc, k));
}

export function hasAnyCard(sc: Scenario): boolean {
  return activeKeys(sc).some((k) => !!sc.slots[k]?.card);
}

/** 用卡片組出來的劇本名：「舞台與真相」 */
export function autoTitle(deck: Deck, sc: Scenario): string {
  const st = slotCard(deck, sc, 'stage')?.title ?? '';
  const tr = slotCard(deck, sc, 'truth')?.title ?? '';
  return st && tr ? S.doc.autoTitle(st, tr) : st || tr || S.doc.untitled;
}

export const titleOf = (deck: Deck, sc: Scenario): string => sc.title.trim() || autoTitle(deck, sc);

/** 這份劇本的氣氛卡叫什麼（還沒決定氣氛時是「氣氛卡」） */
export function toneSlotName(deck: Deck, sc: Pick<Scenario, 'tone'>): string {
  return findTone(deck, sc.tone)?.slot ?? S.cats.tone;
}

/** 卡的種類的名稱（氣氛卡依氣氛換名字） */
export function catName(deck: Deck, sc: Pick<Scenario, 'tone'> | null, cat: CardCat): string {
  if (cat === 'tone' && sc) return toneSlotName(deck, sc);
  return S.cats[cat];
}

/* ---------- PC 與 NPC ---------- */

export function pcLabel(sc: Scenario, i: number): string {
  const nm = sc.pcs[i - 1]?.name.trim() ?? '';
  return nm ? S.cast.pcNamed(i, nm) : S.cast.pc(i);
}

export interface NpcEntry {
  id: string;
  label: string;
}

/** 關係的對象可以選的 NPC：抽到的 NPC 卡＋追加的 NPC */
export function npcList(deck: Deck, sc: Scenario): NpcEntry[] {
  const out: NpcEntry[] = [];
  const card = slotCard(deck, sc, 'npc');
  if (card) out.push({ id: 'npc', label: sc.npc.name.trim() || card.title });
  sc.extras.forEach((x, i) => {
    out.push({ id: x.id, label: x.name.trim() || S.cast.extraNpc(i + 1) });
  });
  return out;
}

/** PC i 的關係的對象（沒選或選的不在了：PC1 → PC2 → … → PC1；只有一個 PC 時是 NPC） */
export function relTarget(deck: Deck, sc: Scenario, i: number): string {
  const t = sc.pcs[i - 1]?.target ?? null;
  const m = /^pc(\d)$/.exec(t ?? '');
  if (m && Number(m[1]) <= sc.pcCount && Number(m[1]) !== i) return t as string;
  if (t && !m && npcList(deck, sc).some((n) => n.id === t)) return t;
  return sc.pcCount === 1 ? 'npc' : `pc${(i % sc.pcCount) + 1}`;
}

export function targetLabel(deck: Deck, sc: Scenario, target: string): string {
  const m = /^pc(\d)$/.exec(target);
  if (m) return pcLabel(sc, Number(m[1]));
  return npcList(deck, sc).find((n) => n.id === target)?.label ?? S.cats.npc;
}

/** 欄的「誰的卡」：「PC1 → PC2」、「PC1」 */
export function slotWho(deck: Deck, sc: Scenario, key: string): string {
  const i = slotOwner(key);
  if (!i) return '';
  if (key.startsWith('rel'))
    return S.cast.relWho(S.cast.pc(i), targetLabel(deck, sc, relTarget(deck, sc, i)));
  return S.cast.pc(i);
}
