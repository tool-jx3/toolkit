/**
 * 一份劇本（骨架）：抽到的卡、鎖定、回答、改寫的提問、角色（角色）、推理題與場景。
 * 純資料與小工具（不依賴 React）；抽卡的規則在 draw.ts、推理與場景在 plot.ts。
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

/** 故事的卡（不含 PC 的卡），照畫面與文件的排法：餘韻與收尾、開場與阻礙、幕後與線頭 */
export const STORY_KEYS = [
  'core',
  'ending',
  'intro',
  'stage',
  'obstacle',
  'truth',
  'tone',
  'clue',
  'npc',
] as const;
export type StoryKey = (typeof STORY_KEYS)[number];
export type DeskGroupId = 'aim' | 'front' | 'back';
/** 桌面與文件的三組卡 */
export const DESK_GROUPS: readonly { id: DeskGroupId; keys: readonly StoryKey[] }[] = [
  { id: 'aim', keys: ['core', 'ending'] },
  { id: 'front', keys: ['intro', 'stage', 'obstacle'] },
  { id: 'back', keys: ['truth', 'tone', 'clue', 'npc'] },
];
/** 填答的三組（從結尾想回來 → 開場與阻礙 → 桌上會出現的東西） */
export const ANSWER_GROUPS: readonly (readonly StoryKey[])[] = [
  ['core', 'ending', 'truth'],
  ['intro', 'stage', 'obstacle'],
  ['tone', 'clue', 'npc'],
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
export type SetupStage = 'core' | 'cards';
export type Step = 'cards' | 'cast' | 'answers' | 'plot' | 'sheet';
export const STEPS: readonly Step[] = ['cards', 'cast', 'answers', 'plot', 'sheet'];
export type MadeBy = 'random' | 'setup' | 'catalog';

export interface Slot {
  card: string | null;
  locked: boolean;
}

/** 回答或改寫的提問：只在同一張卡還在欄上時有效 */
export interface Written {
  card: string;
  text: string;
}

export interface PcInfo {
  /** 名字 */
  name: string;
  /** 身分 */
  role: string;
  /** 牽扯的對象：`pc2`、`npc`、配角的 id；null＝預設（PC1 → PC2 → … → PC1） */
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
  /** 怎麼拿到（檢定、條件、要問誰） */
  how: string;
  /** 放在哪個場景（id；空字串＝還沒放） */
  scene: string;
  /** 指向哪些推理題（id） */
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
  /** 題材、氣氛（null＝還沒決定，抽的時候抽的時候再決定） */
  mission: string | null;
  tone: string | null;
  madeBy: MadeBy | null;
  phase: Phase;
  setupStage: SetupStage;
  /** 「先挑餘韻」發的三張餘韻 */
  coreOffer: string[];
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

export const noPlot = (): Plot => ({ deductions: [], scenes: [], clues: [] });
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
    setupStage: 'core',
    coreOffer: [],
    step: 'cards',
    pcCount: options.pcCount ?? 2,
    useSecrets: options.useSecrets ?? true,
    slots: emptySlots(),
    pcs: Array.from({ length: PC_MAX }, emptyPc),
    npc: { name: '', tie: '' },
    extras: [],
    answers: {},
    questions: {},
    plot: noPlot(),
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
export function replyOf(sc: Scenario, key: string): string {
  const a = sc.answers[key];
  const card = sc.slots[key]?.card;
  return a && card && a.card === card ? a.text : '';
}

export function promptEdited(sc: Scenario, key: string): boolean {
  const q = sc.questions[key];
  const card = sc.slots[key]?.card;
  return !!(q && card && q.card === card);
}

/** 提問（改寫過就是改寫的） */
export function promptOf(deck: Deck, sc: Scenario, key: string): string {
  const card = slotCard(deck, sc, key);
  if (!card) return '';
  return promptEdited(sc, key) ? sc.questions[key].text : card.question;
}

export function writeReply(sc: Scenario, key: string, text: string): void {
  const card = sc.slots[key]?.card;
  if (card && text.trim()) sc.answers[key] = { card, text };
  else delete sc.answers[key];
}

/** 改寫提問；和原本一樣或空白＝回到原本的提問 */
export function writePrompt(deck: Deck, sc: Scenario, key: string, text: string): void {
  const card = slotCard(deck, sc, key);
  const t = text.trim();
  if (card && t && t !== card.question) sc.questions[key] = { card: card.id, text: t };
  else delete sc.questions[key];
}

/** 換卡：回答與改寫的提問跟著那張卡，換掉就清掉 */
export function setSlotCard(sc: Scenario, key: string, card: string | null): void {
  const slot = sc.slots[key] ?? { card: null, locked: false };
  slot.card = card;
  sc.slots[key] = slot;
  if (sc.answers[key] && sc.answers[key].card !== card) delete sc.answers[key];
  if (sc.questions[key] && sc.questions[key].card !== card) delete sc.questions[key];
}

/** 回答過的欄（已有卡的） */
export function repliedKeys(sc: Scenario, keys: readonly string[]): string[] {
  return keys.filter((k) => !!replyOf(sc, k));
}

export function hasAnyCard(sc: Scenario): boolean {
  return activeKeys(sc).some((k) => !!sc.slots[k]?.card);
}

/** 沒取名時用卡片拼的名字：「舞台：焦點」（真相是 GM 的秘密，不放進劇本名） */
export function fallbackTitle(deck: Deck, sc: Scenario): string {
  const st = slotCard(deck, sc, 'stage')?.title ?? '';
  const tn = slotCard(deck, sc, 'tone')?.title ?? '';
  return st && tn ? S.doc.fallbackTitle(st, tn) : st || tn || S.doc.untitled;
}

export const titleOf = (deck: Deck, sc: Scenario): string =>
  sc.title.trim() || fallbackTitle(deck, sc);

/** 這份劇本的焦點卡叫什麼（依氣氛換名字；還沒決定氣氛時是「焦點」） */
export function toneSlotName(deck: Deck, sc: Pick<Scenario, 'tone'>): string {
  return findTone(deck, sc.tone)?.slot ?? S.cats.tone;
}

/** 卡的種類的名稱（焦點依氣氛換名字） */
export function catName(deck: Deck, sc: Pick<Scenario, 'tone'> | null, cat: CardCat): string {
  if (cat === 'tone' && sc) return toneSlotName(deck, sc);
  return S.cats[cat];
}

/* ---------- 角色（角色） ---------- */

export function pcDisplayName(sc: Scenario, i: number): string {
  const nm = sc.pcs[i - 1]?.name.trim() ?? '';
  return nm ? S.cast.pcNamed(i, nm) : S.cast.pc(i);
}

export interface NpcEntry {
  id: string;
  label: string;
}

/** 牽扯的對象可以選的 NPC：抽到的 NPC 卡＋配角 */
export function npcChoices(deck: Deck, sc: Scenario): NpcEntry[] {
  const out: NpcEntry[] = [];
  const card = slotCard(deck, sc, 'npc');
  if (card) out.push({ id: 'npc', label: sc.npc.name.trim() || card.title });
  sc.extras.forEach((x, i) => {
    out.push({ id: x.id, label: x.name.trim() || S.cast.extraNpc(i + 1) });
  });
  return out;
}

/** PC i 牽扯的對象（沒選或選的不在了：PC1 → PC2 → … → PC1；只有一個 PC 時是 NPC） */
export function bondTargetOf(deck: Deck, sc: Scenario, i: number): string {
  const t = sc.pcs[i - 1]?.target ?? null;
  const m = /^pc(\d)$/.exec(t ?? '');
  if (m && Number(m[1]) <= sc.pcCount && Number(m[1]) !== i) return t as string;
  if (t && !m && npcChoices(deck, sc).some((n) => n.id === t)) return t;
  return sc.pcCount === 1 ? 'npc' : `pc${(i % sc.pcCount) + 1}`;
}

export function bondTargetName(deck: Deck, sc: Scenario, target: string): string {
  const m = /^pc(\d)$/.exec(target);
  if (m) return pcDisplayName(sc, Number(m[1]));
  return npcChoices(deck, sc).find((n) => n.id === target)?.label ?? S.cats.npc;
}

/** 欄的「誰的卡」：「PC1 → PC2」、「PC1」 */
export function slotWho(deck: Deck, sc: Scenario, key: string): string {
  const i = slotOwner(key);
  if (!i) return '';
  if (key.startsWith('rel'))
    return S.cast.bondLabel(S.cast.pc(i), bondTargetName(deck, sc, bondTargetOf(deck, sc, i)));
  return S.cast.pc(i);
}
