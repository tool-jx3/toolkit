/**
 * 動作：改目前的劇本、劇本清單、卡片一覽。確認對話框與通知由畫面（App 的 hook）處理，這裡只改資料。
 * 亂數：頁面上有 `window.__plotDeckSeed`（字串）時用它當種子（E2E 與對等驗證用），否則 Math.random。
 */
import { seededRandom } from '@/core/names';
import { type CardCat, type DeckId, findCard, getDeck, isPcCat } from './data';
import {
  applyMissionTone,
  coreMisfits,
  dealCores,
  drawAll,
  drawPcCards,
  fixAfterTruth,
  pickCard,
  randomAnswer,
  refitToCore,
  settleMissionTone,
} from './model/draw';
import { blankPlot, moveScene, removePlotItem, seedPlot } from './model/plot';
import { LIBRARY_MAX, type PlotDeckState } from './model/project';
import {
  answerOf,
  type Clue,
  emptyPlot,
  emptySlots,
  hasAnyCard,
  isPcKey,
  newScenario,
  PC_MAX,
  PC_MIN,
  pcKeys,
  type Scenario,
  STORY_KEYS,
  type Step,
  setSlotCard,
  slotCat,
  uid,
  setAnswer as writeAnswer,
  setQuestion as writeQuestion,
} from './model/scenario';
import { usePlot } from './store';
import { S } from './strings';

/* ---------- 亂數 ---------- */

let seeded: (() => number) | null = null;
export const SEED_HOOK = '__plotDeckSeed';

export function rng(): number {
  if (!seeded && typeof window !== 'undefined') {
    const seed = (window as unknown as Record<string, unknown>)[SEED_HOOK];
    if (typeof seed === 'string' && seed) seeded = seededRandom(seed);
  }
  return seeded ? seeded() : Math.random();
}

/* ---------- 讀取 ---------- */

export const stateNow = (): PlotDeckState => usePlot.getState().data;

export function currentOf(state: PlotDeckState): Scenario | null {
  return state.scenarios.find((s) => s.id === state.current) ?? null;
}

export const currentNow = (): Scenario | null => currentOf(stateNow());

/** 清單上的劇本（抽過卡的），新的在前 */
export function libraryOf(state: PlotDeckState): Scenario[] {
  return state.scenarios.filter(hasAnyCard).sort((a, b) => b.updated - a.updated);
}

/* ---------- 寫入 ---------- */

type Recipe = (sc: Scenario, deck: ReturnType<typeof getDeck>) => void;

/** 改目前的劇本（更新時間跟著改） */
export function edit(recipe: Recipe): void {
  usePlot.getState().update((d) => {
    const sc = d.scenarios.find((s) => s.id === d.current);
    if (!sc) return;
    recipe(sc as Scenario, getDeck(sc.deck));
    sc.updated = Date.now();
  });
}

/** 目前沒有劇本時開一份新的（開頁時呼叫；不留成一步復原） */
export function ensureCurrent(deck: DeckId = 'modern'): void {
  if (currentNow()) return;
  const sc = newScenario(deck);
  usePlot.getState().update((d) => {
    d.scenarios.unshift(sc);
    d.current = sc.id;
  });
  usePlot.temporal.getState().clear();
}

/** 沒抽過卡、也不是目前這份的劇本拿掉 */
function prune(d: PlotDeckState): void {
  d.scenarios = d.scenarios.filter((s) => s.id === d.current || hasAnyCard(s));
}

/** 開一份新的劇本（目前這份留在清單裡）；沿用卡組、PC 人數與秘密卡的設定。超過上限時 false */
export function startNew(deck?: DeckId): boolean {
  const cur = currentNow();
  if (cur && cur.phase === 'start' && !hasAnyCard(cur)) {
    if (deck && deck !== cur.deck)
      edit((sc) => {
        sc.deck = deck;
        sc.mission = null;
        sc.tone = null;
      });
    return true;
  }
  if (libraryOf(stateNow()).length >= LIBRARY_MAX) return false;
  const sc = newScenario(deck ?? cur?.deck ?? 'modern', {
    pcCount: cur?.pcCount,
    useSecrets: cur?.useSecrets,
  });
  usePlot.getState().update((d) => {
    d.scenarios.unshift(sc);
    d.current = sc.id;
    prune(d);
  });
  return true;
}

/* ---------- 開始的畫面 ---------- */

/** 換卡組：還沒抽卡時直接換；抽過卡時另開一份（呼叫端先確認） */
export function setDeck(deck: DeckId): void {
  const cur = currentNow();
  if (!cur || cur.deck === deck) return;
  if (hasAnyCard(cur) || cur.phase !== 'start') startNew(deck);
  else
    edit((sc) => {
      sc.deck = deck;
      sc.mission = null;
      sc.tone = null;
    });
}

export function setMission(mission: string | null): void {
  edit((sc) => {
    sc.mission = mission;
  });
}

export function setTone(tone: string | null): void {
  edit((sc) => {
    sc.tone = tone;
  });
}

export function setPcCount(n: number): void {
  edit((sc) => {
    sc.pcCount = Math.min(PC_MAX, Math.max(PC_MIN, Math.round(n)));
  });
}

export function setUseSecrets(on: boolean): void {
  edit((sc) => {
    sc.useSecrets = on;
  });
}

function clearCards(sc: Scenario): void {
  sc.slots = emptySlots();
  sc.answers = {};
  sc.questions = {};
  sc.plot = emptyPlot();
  sc.coreDeal = [];
  sc.step = 'cards';
  sc.setupStep = 'core';
}

/** 隨機抽：題材與氣氛沒選的交給系統，全部抽 */
export function startRandom(): void {
  edit((sc, deck) => {
    clearCards(sc);
    settleMissionTone(deck, sc, rng);
    sc.madeBy = 'random';
    sc.phase = 'done';
    drawAll(deck, sc, rng);
  });
}

/** 照條件抽：題材與氣氛沒選的交給系統，發三張體驗的核心 */
export function startSetup(): void {
  edit((sc, deck) => {
    clearCards(sc);
    settleMissionTone(deck, sc, rng);
    sc.madeBy = 'setup';
    sc.phase = 'setup';
    sc.setupStep = 'core';
    sc.coreDeal = dealCores(deck, sc, rng);
  });
}

export function redealCores(): void {
  edit((sc, deck) => {
    sc.coreDeal = dealCores(deck, sc, rng);
  });
}

/** 選了體驗的核心（鎖定），往「想先決定的卡」 */
export function chooseCore(cardId: string): void {
  edit((sc) => {
    setSlotCard(sc, 'core', cardId);
    sc.slots.core.locked = true;
    sc.setupStep = 'cards';
  });
}

export function setupToCards(): void {
  edit((sc) => {
    if (sc.slots.core.card) sc.setupStep = 'cards';
  });
}

export function setupBackToCore(): void {
  edit((sc, deck) => {
    sc.setupStep = 'core';
    if (!sc.coreDeal.length) sc.coreDeal = dealCores(deck, sc, rng);
  });
}

/** 不做了：回到開始的畫面 */
export function setupCancel(): void {
  edit((sc) => {
    clearCards(sc);
    sc.phase = 'start';
    sc.madeBy = null;
  });
}

/** 抽剩下的（挑好的卡是鎖定的，不會換） */
export function setupDraw(): void {
  edit((sc, deck) => {
    sc.phase = 'done';
    sc.step = 'cards';
    drawAll(deck, sc, rng);
  });
}

/** 照條件抽的時候拿掉挑好的卡 */
export function clearSlot(key: string): void {
  edit((sc) => {
    setSlotCard(sc, key, null);
    sc.slots[key].locked = false;
  });
}

/* ---------- 抽卡 ---------- */

/** 重抽一張。回傳換掉的欄，與（換的是體驗的核心時）合不來的真相與結局 */
export function reroll(key: string): { changed: string[]; misfits: string[] } {
  let changed: string[] = [];
  let misfits: string[] = [];
  edit((sc, deck) => {
    if (sc.slots[key]?.locked) return;
    pickCard(deck, sc, key, rng, true);
    changed = [key];
    if (key === 'truth') changed.push(...fixAfterTruth(deck, sc, rng));
    if (key === 'core') misfits = coreMisfits(deck, sc);
  });
  return { changed, misfits };
}

/** 從清單挑。照條件抽的時候挑的卡會鎖定 */
export function pickFromList(
  key: string,
  cardId: string,
): { changed: string[]; misfits: string[] } {
  let changed: string[] = [];
  let misfits: string[] = [];
  edit((sc, deck) => {
    const card = findCard(deck, cardId);
    if (!card || card.cat !== slotCat(key)) return;
    setSlotCard(sc, key, cardId);
    changed = [key];
    if (sc.phase === 'setup') {
      sc.slots[key].locked = true;
      if (key === 'core' && sc.setupStep === 'core') sc.setupStep = 'cards';
      return;
    }
    if (key === 'truth') changed.push(...fixAfterTruth(deck, sc, rng));
    if (key === 'core') misfits = coreMisfits(deck, sc);
  });
  return { changed, misfits };
}

/** 依體驗的核心重抽合不來的真相與結局 */
export function refitCore(keys: readonly string[]): string[] {
  let changed: string[] = [];
  edit((sc, deck) => {
    changed = refitToCore(deck, sc, keys, rng);
  });
  return changed;
}

export function toggleLock(key: string): void {
  edit((sc) => {
    if (sc.slots[key]?.card) sc.slots[key].locked = !sc.slots[key].locked;
  });
}

/** 全部重抽（鎖定的與 PC 的卡不動） */
export function redrawAll(): string[] {
  let changed: string[] = [];
  edit((sc, deck) => {
    changed = drawAll(deck, sc, rng);
  });
  return changed;
}

/** 換題材與氣氛，重抽 targets */
export function changeMissionTone(
  mission: string | null,
  tone: string | null,
  targets: readonly string[],
): string[] {
  let changed: string[] = [];
  edit((sc, deck) => {
    changed = applyMissionTone(deck, sc, mission, tone, targets, rng);
  });
  return changed;
}

/* ---------- PC 與 NPC ---------- */

export function drawPc(pc?: number): string[] {
  let keys: string[] = [];
  edit((sc, deck) => {
    keys = drawPcCards(deck, sc, rng, pc);
  });
  return keys;
}

export function setPcField(i: number, field: 'name' | 'role', value: string): void {
  edit((sc) => {
    sc.pcs[i - 1][field] = value;
  });
}

export function setPcTarget(i: number, target: string): void {
  edit((sc) => {
    sc.pcs[i - 1].target = target;
  });
}

export function setNpcField(field: 'name' | 'tie', value: string): void {
  edit((sc) => {
    sc.npc[field] = value;
  });
}

export function addExtraNpc(): string {
  const id = uid('x');
  edit((sc) => {
    sc.extras.push({ id, name: '', role: '', tie: '' });
  });
  return id;
}

export function setExtraField(id: string, field: 'name' | 'role' | 'tie', value: string): void {
  edit((sc) => {
    const x = sc.extras.find((n) => n.id === id);
    if (x) x[field] = value;
  });
}

export function removeExtraNpc(id: string): void {
  edit((sc) => {
    sc.extras = sc.extras.filter((n) => n.id !== id);
    for (const p of sc.pcs) if (p.target === id) p.target = null;
  });
}

/* ---------- 回答 ---------- */

export function setAnswer(key: string, text: string): void {
  edit((sc) => writeAnswer(sc, key, text));
}

export function setQuestion(key: string, text: string): void {
  edit((sc, deck) => writeQuestion(deck, sc, key, text));
}

export function resetQuestion(key: string): void {
  edit((sc) => {
    delete sc.questions[key];
  });
}

/** 隨機回答（回傳填上的文字） */
export function randomAnswerFor(key: string): string {
  let text = '';
  edit((sc, deck) => {
    text = randomAnswer(deck, sc, key, rng);
    if (text) writeAnswer(sc, key, text);
  });
  return text;
}

/**
 * 沒回答的隨機填。withNpc：「PC 與 NPC」一步的按鈕（NPC 卡的回答、還沒取名的 NPC 也填上名字）。回傳填了幾題
 */
export function fillAnswers(keys: readonly string[], withNpc = false): number {
  let n = 0;
  edit((sc, deck) => {
    const list = withNpc ? [...keys, 'npc'] : keys;
    for (const k of list) {
      if (!sc.slots[k]?.card || answerOf(sc, k)) continue;
      const t = randomAnswer(deck, sc, k, rng);
      if (t) {
        writeAnswer(sc, k, t);
        n++;
      }
    }
    if (withNpc && sc.slots.npc.card && !sc.npc.name.trim() && deck.names.length) {
      sc.npc.name = deck.names[Math.floor(rng() * deck.names.length)];
      n++;
    }
  });
  return n;
}

/* ---------- 步驟與劇本名 ---------- */

export function setStep(step: Step): void {
  edit((sc) => {
    if (sc.phase === 'done') sc.step = step;
  });
}

export function setTitle(title: string): void {
  edit((sc) => {
    sc.title = title.slice(0, 60);
  });
}

/* ---------- 場景與線索 ---------- */

export function seedPlotFromCards(): void {
  edit((sc, deck) => {
    sc.plot = seedPlot(deck, sc);
  });
}

export function startBlankPlot(): void {
  edit((sc) => {
    sc.plot = blankPlot();
  });
}

export function addDeduction(): string {
  const id = uid('n');
  edit((sc) => {
    sc.plot.deductions.push({ id, text: '' });
  });
  return id;
}

export function addScene(): string {
  const id = uid('s');
  edit((sc) => {
    sc.plot.scenes.push({ id, name: '', place: '', what: '' });
  });
  return id;
}

export function addClue(scene = ''): string {
  const id = uid('c');
  edit((sc) => {
    sc.plot.clues.push({ id, text: '', how: '', scene, links: [] });
  });
  return id;
}

export function setDeductionText(id: string, text: string): void {
  edit((sc) => {
    const d = sc.plot.deductions.find((x) => x.id === id);
    if (d) d.text = text;
  });
}

export function setSceneField(id: string, field: 'name' | 'place' | 'what', value: string): void {
  edit((sc) => {
    const s = sc.plot.scenes.find((x) => x.id === id);
    if (s) s[field] = value;
  });
}

export function setClueField(id: string, field: 'text' | 'how', value: string): void {
  edit((sc) => {
    const c = sc.plot.clues.find((x) => x.id === id);
    if (c) c[field] = value;
  });
}

export function setClueScene(id: string, scene: string): void {
  edit((sc) => {
    const c = sc.plot.clues.find((x) => x.id === id);
    if (c) c.scene = sc.plot.scenes.some((s) => s.id === scene) ? scene : '';
  });
}

export function toggleClueLink(id: string, deduction: string): void {
  edit((sc) => {
    const c: Clue | undefined = sc.plot.clues.find((x) => x.id === id);
    if (!c) return;
    c.links = c.links.includes(deduction)
      ? c.links.filter((x) => x !== deduction)
      : [...c.links, deduction];
  });
}

export function moveSceneBy(id: string, dir: -1 | 1): void {
  edit((sc) => {
    moveScene(sc.plot, id, dir);
  });
}

export function removePlot(kind: 'deduction' | 'scene' | 'clue', id: string): void {
  edit((sc) => removePlotItem(sc.plot, kind, id));
}

/* ---------- 劇本清單 ---------- */

export function openScenario(id: string, step?: Step): void {
  usePlot.getState().update((d) => {
    if (!d.scenarios.some((s) => s.id === id)) return;
    d.current = id;
    const sc = d.scenarios.find((s) => s.id === id);
    if (sc && step && sc.phase === 'done') sc.step = step;
    prune(d);
  });
}

export function renameScenario(id: string, title: string): void {
  usePlot.getState().update((d) => {
    const sc = d.scenarios.find((s) => s.id === id);
    if (sc) sc.title = title.slice(0, 60);
  });
}

/** 複製一份（加在清單最前面；目前的劇本不變；劇本名是 title）。超過上限時 null */
export function duplicateScenario(id: string, title: string): Scenario | null {
  const src = stateNow().scenarios.find((s) => s.id === id);
  if (!src || libraryOf(stateNow()).length >= LIBRARY_MAX) return null;
  const now = Date.now();
  const copy: Scenario = {
    ...structuredClone(src),
    id: uid('s', now),
    created: now,
    updated: now,
    title: title.slice(0, 60),
  };
  usePlot.getState().update((d) => {
    d.scenarios.unshift(copy);
  });
  return copy;
}

/** 刪掉一份；刪的是目前這份時開一份新的（同一個卡組） */
export function deleteScenario(id: string): void {
  usePlot.getState().update((d) => {
    const sc = d.scenarios.find((s) => s.id === id);
    if (!sc) return;
    d.scenarios = d.scenarios.filter((s) => s.id !== id);
    if (d.current === id) {
      const fresh = newScenario(sc.deck, { pcCount: sc.pcCount, useSecrets: sc.useSecrets });
      d.scenarios.unshift(fresh);
      d.current = fresh.id;
    }
  });
}

/* ---------- 卡片一覽 ---------- */

/**
 * 用卡片一覽挑的卡開始一份新的劇本：挑的卡放進欄並鎖定，其他的抽。
 * 挑了體驗的核心或氣氛卡時，氣氛跟著那張卡（題材沒決定時交給系統）。超過上限時 false
 */
export function startFromCatalog(deck: DeckId, picks: Partial<Record<CardCat, string>>): boolean {
  if (!startNew(deck)) return false;
  edit((sc, d) => {
    clearCards(sc);
    sc.deck = deck;
    for (const [cat, id] of Object.entries(picks)) {
      const card = findCard(d, id);
      if (!card || card.cat !== cat || isPcCat(card.cat)) continue;
      setSlotCard(sc, cat, card.id);
      sc.slots[cat].locked = true;
      const t = card.cat === 'core' || card.cat === 'tone' ? card.tones?.[0] : undefined;
      if (t) sc.tone = t;
    }
    /* 核心與氣氛卡的氣氛不同時，以核心為準，氣氛卡改成可以換 */
    const tone = findCard(d, sc.slots.tone.card);
    if (tone && sc.tone && !tone.tones?.includes(sc.tone)) sc.slots.tone.locked = false;
    settleMissionTone(d, sc, rng);
    sc.madeBy = 'catalog';
    sc.phase = 'done';
    sc.step = 'cards';
    drawAll(d, sc, rng);
  });
  return true;
}

/* ---------- 專案檔與重設 ---------- */

/** 開啟專案檔：加進清單、變成目前的劇本（id 換新的，不會蓋掉清單裡的） */
export function addLoadedScenario(sc: Scenario): void {
  const now = Date.now();
  const copy: Scenario = { ...sc, id: uid('s', now), updated: now };
  usePlot.getState().update((d) => {
    d.scenarios.unshift(copy);
    d.current = copy.id;
    prune(d);
    if (d.scenarios.length > LIBRARY_MAX) d.scenarios = d.scenarios.slice(0, LIBRARY_MAX);
  });
}

/** 重設目前的劇本：回到開始的畫面（卡組、題材、氣氛、PC 人數與秘密卡留著） */
export function resetCurrent(): void {
  edit((sc) => {
    clearCards(sc);
    sc.phase = 'start';
    sc.madeBy = null;
    sc.title = '';
    sc.pcs = sc.pcs.map(() => ({ name: '', role: '', target: null }));
    sc.npc = { name: '', tie: '' };
    sc.extras = [];
  });
}

/* ---------- 給畫面的小工具 ---------- */

/** PC 的欄（目前的劇本） */
export const pcSlotKeys = (sc: Scenario): string[] => pcKeys(sc);

/** 全部重抽會換掉的欄（沒鎖定的故事的卡） */
export const redrawTargets = (sc: Scenario): string[] =>
  STORY_KEYS.filter((k) => !sc.slots[k].locked);

export { isPcKey };
export const libraryFullMessage = (): string => S.library.full(LIBRARY_MAX);
