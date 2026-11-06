/**
 * 動作：產生一批（NPC、委託要先載入名字的語料）、改產生器與條件（改了就換一批，鎖定的留著）、重抽一張或一欄、鎖定、
 * 複製（文字、CCFOLIA 棋子）、我的清單、紀錄、匯出、自訂產生器。每個動作是一步復原。
 */
import { create } from 'zustand';
import { copyText, downloadText } from '@/core/files';
import { randomSeed, seededRandom } from '@/core/names';
import { loadCorpus, loadedCorpus } from '@/core/names/corpus';
import type { CustomGenerator, GenEnv, GeneratorDef } from './generators';
import { CUSTOM_PREFIX } from './generators';
import {
  batchText,
  CUSTOM_MAX,
  cardText,
  ccfoliaCharacter,
  countOf,
  csvText,
  currentGenerator,
  exportFileName,
  fantasyNames,
  findGenerator,
  type GenState,
  generateBatch,
  type HistoryEntry,
  namelessFields,
  newCardId,
  newCustomId,
  optionsLabel,
  optionsOf,
  pushHistory,
  type ResultCard,
  rerollCard,
  rerollField,
  SAVED_MAX,
  sanitizeHistory,
  sanitizeState,
} from './logic';
import { useGen, useHistory } from './store';
import { S } from './strings';

interface Status {
  loading: boolean;
  failed: boolean;
  /** 自訂產生器這次找不到的表等 */
  issues: string[];
}

/** 讀取中、讀不到、這一批的問題（不存檔、不列入復原） */
export const useStatus = create<Status>(() => ({ loading: false, failed: false, issues: [] }));

export const currentState = (): GenState => sanitizeState(useGen.getState().data);

/** 名字的語料（還沒載入時 null） */
export function envNow(): GenEnv {
  const data = loadedCorpus('fantasy');
  return { names: data ? fantasyNames(data) : null };
}

/** 一個獨立的復原步驟；已經在手勢裡（拖數量的滑桿）時併進那個手勢 */
async function asStep(fn: () => void | Promise<void>): Promise<void> {
  const own = !useGen.inGesture();
  if (own) useGen.beginGesture();
  try {
    await fn();
  } finally {
    if (own) useGen.endGesture();
  }
}

let ticket = 0;

/** NPC、委託：先載入名字的語料（讀不到時照樣產生，名字是「（無名氏）」，另外提示） */
async function ensureNames(def: GeneratorDef): Promise<boolean> {
  if (!def.needsNames || loadedCorpus('fantasy')) return true;
  useStatus.setState({ loading: true, failed: false });
  try {
    await loadCorpus('fantasy');
    useStatus.setState({ loading: false });
    return true;
  } catch {
    useStatus.setState({ loading: false, failed: true });
    return false;
  }
}

/**
 * 補上名字：語料讀不到時產生的卡（名字是「（無名氏）」）在語料讀到之後只重抽名字那一欄（其他欄不變；算一步復原）。
 * 開頁時與按「再試一次」時呼叫；讀不到時再提示一次。
 */
export async function fillMissingNames(): Promise<void> {
  if (!namelessFields(currentState()).length) return;
  if (!loadedCorpus('fantasy')) {
    try {
      await loadCorpus('fantasy');
    } catch {
      useStatus.setState({ failed: true });
      return;
    }
  }
  useStatus.setState({ failed: false });
  await asStep(() => {
    const state = currentState();
    const env = envNow();
    const fixed = new Map(
      namelessFields(state).map(({ card, key, def }) => [
        card.id,
        rerollField(card, key, def, optionsOf(state, card.gen), env, freshRng()),
      ]),
    );
    useGen.getState().update((d) => {
      d.results = d.results.map((c) => fixed.get(c.id) ?? c);
    });
  });
}

async function generateNow(): Promise<void> {
  const mine = ++ticket;
  const before = currentState();
  const def = currentGenerator(before);
  await ensureNames(def);
  if (mine !== ticket) return;
  const state = currentState();
  if (state.gen !== before.gen) return;
  const options = optionsOf(state, def.id);
  const batch = generateBatch({
    def,
    options,
    env: envNow(),
    count: countOf(state, def),
    seed: state.seed,
    current: state.results,
  });
  useGen.getState().update((d) => {
    d.results = batch.results;
    d.lastSeed = batch.seed;
  });
  useStatus.setState({ issues: batch.issues });
  const at = Date.now();
  const fresh = batch.results.filter((r) => !r.locked);
  if (fresh.length) {
    useHistory.getState().patch({
      history: pushHistory(sanitizeHistory(useHistory.getState().data.history), {
        id: `${at}-${batch.seed}`,
        at,
        gen: def.id,
        label: def.label,
        detail: optionsLabel(def, options),
        seed: batch.seed,
        results: batch.results.map((r) => ({ gen: r.gen, variant: r.variant, parts: r.parts })),
      }),
    });
  }
}

/** 產生一批：鎖住的卡留著，其他換成新的 */
export function generate(): Promise<void> {
  return asStep(generateNow);
}

/** 改產生器、條件、數量：改了就換一批（條件與新的一批算一步） */
export function setConditions(recipe: (d: GenState) => void): Promise<void> {
  return asStep(async () => {
    useGen.getState().update((d) => {
      recipe(d as GenState);
    });
    await generateNow();
  });
}

export function setGenerator(id: string): Promise<void> {
  if (currentState().gen === id) return Promise.resolve();
  return setConditions((d) => {
    d.gen = id;
  });
}

export function setOption(gen: string, key: string, value: string): Promise<void> {
  return setConditions((d) => {
    d.options[gen] = { ...(d.options[gen] ?? {}), [key]: value };
  });
}

export function setCount(gen: string, n: number): Promise<void> {
  return setConditions((d) => {
    d.counts[gen] = n;
  });
}

function findCard(state: GenState, id: string): ResultCard | undefined {
  return state.results.find((c) => c.id === id);
}

function replaceCard(id: string, next: ResultCard) {
  useGen.getState().update((d) => {
    const i = d.results.findIndex((c) => c.id === id);
    if (i >= 0) d.results[i] = next;
  });
}

/** 產生這張卡的產生器與條件（自訂的已經刪掉時 null） */
function sourceOf(state: GenState, card: ResultCard) {
  const def = findGenerator(state, card.gen);
  return def ? { def, options: optionsOf(state, card.gen) } : null;
}

const freshRng = () => seededRandom(randomSeed());

/** 重抽一張（鎖定的欄留著） */
export function rerollOne(id: string): Promise<void> {
  return asStep(async () => {
    const state = currentState();
    const card = findCard(state, id);
    const src = card && sourceOf(state, card);
    if (!card || !src) return;
    await ensureNames(src.def);
    replaceCard(id, rerollCard(card, src.def, src.options, envNow(), freshRng()));
  });
}

/** 只重抽一欄 */
export function rerollOneField(id: string, key: string): Promise<void> {
  return asStep(async () => {
    const state = currentState();
    const card = findCard(state, id);
    const src = card && sourceOf(state, card);
    if (!card || !src) return;
    await ensureNames(src.def);
    replaceCard(id, rerollField(card, key, src.def, src.options, envNow(), freshRng()));
  });
}

export function toggleCardLock(id: string): void {
  void asStep(() =>
    useGen.getState().update((d) => {
      const c = d.results.find((x) => x.id === id);
      if (c) c.locked = !c.locked;
    }),
  );
}

export function toggleFieldLock(id: string, key: string): void {
  void asStep(() =>
    useGen.getState().update((d) => {
      const c = d.results.find((x) => x.id === id);
      if (!c) return;
      c.lockedFields = c.lockedFields.includes(key)
        ? c.lockedFields.filter((k) => k !== key)
        : [...c.lockedFields, key];
    }),
  );
}

/* ---------- 複製與匯出 ---------- */

/** 複製的結果怎麼通知（畫面上的元件註冊：通知要在 ToolShell 的 UiProvider 裡才發得出去） */
type CopyNotifier = (ok: boolean, title: string) => void;
let notifier: CopyNotifier = () => {};

export function setCopyNotifier(fn: CopyNotifier): () => void {
  notifier = fn;
  return () => {
    if (notifier === fn) notifier = () => {};
  };
}

async function copyAndNotify(text: string, title: string): Promise<boolean> {
  const ok = await copyText(text);
  notifier(ok, title);
  return ok;
}

export function copyCard(id: string): Promise<boolean> {
  const card = findCard(currentState(), id);
  return card ? copyAndNotify(cardText(card), S.toast.copied) : Promise.resolve(false);
}

export function copyField(id: string, key: string): Promise<boolean> {
  const card = findCard(currentState(), id);
  const part = card?.parts.find((p) => p.k === key);
  return part ? copyAndNotify(part.t, S.toast.copiedField(part.l ?? key)) : Promise.resolve(false);
}

export function copyCcfolia(id: string): Promise<boolean> {
  const state = currentState();
  const card = findCard(state, id);
  if (!card) return Promise.resolve(false);
  return copyAndNotify(
    ccfoliaCharacter(card, findGenerator(state, card.gen)),
    S.toast.copiedCcfolia,
  );
}

export function copyAll(): Promise<boolean> {
  const { results } = currentState();
  if (!results.length) return Promise.resolve(false);
  return copyAndNotify(batchText(results), S.toast.copiedAll(results.length));
}

const labelOf = (state: GenState) => (gen: string) =>
  findGenerator(state, gen)?.label ?? state.saved.find((s) => s.gen === gen)?.label ?? gen;

export function exportTxt(): void {
  const state = currentState();
  if (!state.results.length) return;
  downloadText(batchText(state.results), exportFileName(currentGenerator(state).label, 'txt'));
}

export function exportCsv(): void {
  const state = currentState();
  if (!state.results.length) return;
  downloadText(
    csvText(state.results, labelOf(state)),
    exportFileName(currentGenerator(state).label, 'csv'),
    'text/csv;charset=utf-8',
  );
}

/* ---------- 我的清單 ---------- */

export function saveCard(id: string): void {
  const state = currentState();
  const card = findCard(state, id);
  if (!card) return;
  void asStep(() =>
    useGen.getState().update((d) => {
      d.saved = [
        ...d.saved,
        {
          id: newCardId('saved', d.saved.length),
          gen: card.gen,
          label: findGenerator(state, card.gen)?.label ?? card.gen,
          parts: card.parts,
          at: Date.now(),
        },
      ].slice(-SAVED_MAX);
    }),
  );
  notifier(true, S.toast.saved);
}

export function removeSaved(id: string): void {
  void asStep(() =>
    useGen.getState().update((d) => {
      d.saved = d.saved.filter((s) => s.id !== id);
    }),
  );
}

export function clearSaved(): void {
  void asStep(() =>
    useGen.getState().update((d) => {
      d.saved = [];
    }),
  );
}

export function copySaved(id: string): Promise<boolean> {
  const item = currentState().saved.find((s) => s.id === id);
  return item ? copyAndNotify(cardText(item), S.toast.copied) : Promise.resolve(false);
}

export function copyAllSaved(): Promise<boolean> {
  const { saved } = currentState();
  if (!saved.length) return Promise.resolve(false);
  return copyAndNotify(batchText(saved), S.toast.copiedAll(saved.length));
}

/* ---------- 紀錄 ---------- */

const historyEntry = (id: string): HistoryEntry | undefined =>
  sanitizeHistory(useHistory.getState().data.history).find((e) => e.id === id);

/** 把紀錄裡的一批放回來（產生器與種子也換回那一批的；鎖定清掉；可以復原） */
export function restoreHistory(id: string): Promise<void> {
  const entry = historyEntry(id);
  if (!entry) return Promise.resolve();
  ++ticket;
  return asStep(() =>
    useGen.getState().update((d) => {
      if (findGenerator(d as GenState, entry.gen)) d.gen = entry.gen;
      d.lastSeed = entry.seed;
      d.results = entry.results.map((r, i) => ({
        id: newCardId(entry.seed, i),
        gen: r.gen,
        variant: r.variant,
        parts: r.parts,
        locked: false,
        lockedFields: [],
      }));
    }),
  );
}

export function copyHistory(id: string): Promise<boolean> {
  const entry = historyEntry(id);
  return entry
    ? copyAndNotify(batchText(entry.results), S.toast.copiedAll(entry.results.length))
    : Promise.resolve(false);
}

export function clearHistory(): void {
  useHistory.getState().patch({ history: [] });
}

/* ---------- 自訂產生器 ---------- */

/** 新增一個自訂產生器（內容是範例），並切換過去 */
export function addCustom(): Promise<void> {
  const state = currentState();
  if (state.customs.length >= CUSTOM_MAX) return Promise.resolve();
  const id = newCustomId(state.customs);
  const custom: CustomGenerator = {
    id,
    name: S.custom.newName(state.customs.length + 1),
    text: S.custom.sample,
  };
  return setConditions((d) => {
    d.customs = [...d.customs, custom];
    d.gen = `${CUSTOM_PREFIX}${id}`;
  });
}

export function updateCustom(id: string, patch: Partial<Omit<CustomGenerator, 'id'>>): void {
  useGen.getState().update((d) => {
    const c = d.customs.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

/** 刪掉一個自訂產生器（目前選的是它時回到 NPC；它產生的結果留著，只是不能再重抽） */
export function removeCustom(id: string): Promise<void> {
  return asStep(async () => {
    const wasCurrent = currentState().gen === `${CUSTOM_PREFIX}${id}`;
    useGen.getState().update((d) => {
      d.customs = d.customs.filter((c) => c.id !== id);
      if (wasCurrent) d.gen = 'npc';
    });
    if (wasCurrent) await generateNow();
  });
}
