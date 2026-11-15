/**
 * 動作：改目前的劇本、我的劇本（清單）、卡庫。確認對話框與通知由畫面（App 的 hook）處理，這裡只改資料。
 * 亂數：頁面上有 `window.__plotDeckSeed`（字串）時用它當種子（E2E 與對等驗證用），否則 Math.random。
 * 復原：打字（劇本名、角色、回答、推理題與場景的文字）照共用層的規則合併；其他一次性的動作（抽卡、重抽、鎖定、
 * 自己挑、刪除、切換劇本…）各記成一步，連續按也不會併在一起（`oneStep`）。
 */
import { seededRandom } from '@/core/names';
import { belongsToPc, type CardCat, type DeckId, findCard, getDeck } from './data';
import {
  applyThemeChange,
  coreMisfits,
  drawPcCards,
  drawStory,
  offerCores,
  pickCard,
  pickExampleReply,
  refitToCore,
  resolveTruthConflicts,
  settleMissionTone,
} from './model/draw';
import { blankPlot, draftPlot, moveScene, removePlotItem } from './model/plot';
import { LIBRARY_MAX, type PlotDeckState } from './model/project';
import {
  type Clue,
  emptySlots,
  hasAnyCard,
  isPcKey,
  newScenario,
  noPlot,
  PC_MAX,
  PC_MIN,
  pcKeys,
  replyOf,
  type Scenario,
  STORY_KEYS,
  type Step,
  setSlotCard,
  slotCat,
  uid,
  writeReply as writeAnswer,
  writePrompt as writeQuestion,
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

/** 改目前的劇本（更新時間跟著改）；打字用，連續的變更照共用層的規則合併成一步 */
export function edit(recipe: Recipe): void {
  usePlot.getState().update((d) => {
    const sc = d.scenarios.find((s) => s.id === d.current);
    if (!sc) return;
    recipe(sc as Scenario, getDeck(sc.deck));
    sc.updated = Date.now();
  });
}

let depth = 0;
/**
 * 一次性的動作記成一步復原：用手勢包起來（裡面的變更只記一步），結束時共用層會把合併的計時歸零，
 * 下一個動作一定是新的一步。動作裡又呼叫動作時只算外面那一步；正在打字的手勢先結束（打的字自己一步）。
 */
export function oneStep<T>(fn: () => T): T {
  if (depth === 0) {
    if (usePlot.inGesture()) usePlot.endGesture();
    usePlot.beginGesture();
  }
  depth++;
  try {
    return fn();
  } finally {
    depth--;
    if (depth === 0) usePlot.endGesture();
  }
}

/** 一次性地改目前的劇本（一步復原） */
const act = (recipe: Recipe): void => oneStep(() => edit(recipe));

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
export function beginScenario(deck?: DeckId): boolean {
  return oneStep(() => beginScenarioNow(deck));
}

function beginScenarioNow(deck?: DeckId): boolean {
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
  if (hasAnyCard(cur) || cur.phase !== 'start') beginScenario(deck);
  else
    act((sc) => {
      sc.deck = deck;
      sc.mission = null;
      sc.tone = null;
    });
}

export function setMission(mission: string | null): void {
  act((sc) => {
    sc.mission = mission;
  });
}

export function setTone(tone: string | null): void {
  act((sc) => {
    sc.tone = tone;
  });
}

export function setPcCount(n: number): void {
  act((sc) => {
    sc.pcCount = Math.min(PC_MAX, Math.max(PC_MIN, Math.round(n)));
  });
}

export function setUseSecrets(on: boolean): void {
  act((sc) => {
    sc.useSecrets = on;
  });
}

function clearCards(sc: Scenario): void {
  sc.slots = emptySlots();
  sc.answers = {};
  sc.questions = {};
  sc.plot = noPlot();
  sc.coreOffer = [];
  sc.step = 'cards';
  sc.setupStage = 'core';
}

/** 一次抽齊：題材與氣氛沒選的先決定，全部抽 */
export function startRandom(): void {
  act((sc, deck) => {
    clearCards(sc);
    settleMissionTone(deck, sc, rng);
    sc.madeBy = 'random';
    sc.phase = 'done';
    drawStory(deck, sc, rng);
  });
}

/** 先挑餘韻：題材與氣氛沒選的先決定，發三張餘韻 */
export function startSetup(): void {
  act((sc, deck) => {
    clearCards(sc);
    settleMissionTone(deck, sc, rng);
    sc.madeBy = 'setup';
    sc.phase = 'setup';
    sc.setupStage = 'core';
    sc.coreOffer = offerCores(deck, sc, rng);
  });
}

export function redealCores(): void {
  act((sc, deck) => {
    sc.coreOffer = offerCores(deck, sc, rng);
  });
}

/** 選了餘韻（鎖定），往「放上想親手決定的卡」 */
export function chooseCore(cardId: string): void {
  act((sc) => {
    setSlotCard(sc, 'core', cardId);
    sc.slots.core.locked = true;
    sc.setupStage = 'cards';
  });
}

export function setupToCards(): void {
  act((sc) => {
    if (sc.slots.core.card) sc.setupStage = 'cards';
  });
}

export function setupBackToCore(): void {
  act((sc, deck) => {
    sc.setupStage = 'core';
    if (!sc.coreOffer.length) sc.coreOffer = offerCores(deck, sc, rng);
  });
}

/** 回開始畫面 */
export function setupCancel(): void {
  act((sc) => {
    clearCards(sc);
    sc.phase = 'start';
    sc.madeBy = null;
  });
}

/** 抽完其餘的（放上去的卡是鎖定的，不會換） */
export function setupDraw(): void {
  act((sc, deck) => {
    sc.phase = 'done';
    sc.step = 'cards';
    drawStory(deck, sc, rng);
  });
}

/** 先挑餘韻的時候拿掉放上去的卡 */
export function clearSlot(key: string): void {
  act((sc) => {
    setSlotCard(sc, key, null);
    sc.slots[key].locked = false;
  });
}

/* ---------- 抽卡 ---------- */

/** 重抽一張。回傳換掉的欄，與（換的是餘韻時）不搭的真相與結局 */
export function reroll(key: string): { changed: string[]; misfits: string[] } {
  let changed: string[] = [];
  let misfits: string[] = [];
  act((sc, deck) => {
    if (sc.slots[key]?.locked) return;
    pickCard(deck, sc, key, rng, true);
    changed = [key];
    if (key === 'truth') changed.push(...resolveTruthConflicts(deck, sc, rng));
    if (key === 'core') misfits = coreMisfits(deck, sc);
  });
  return { changed, misfits };
}

/** 自己挑。先挑餘韻的時候挑的卡會鎖定 */
export function pickFromList(
  key: string,
  cardId: string,
): { changed: string[]; misfits: string[] } {
  let changed: string[] = [];
  let misfits: string[] = [];
  act((sc, deck) => {
    const card = findCard(deck, cardId);
    if (!card || card.cat !== slotCat(key)) return;
    setSlotCard(sc, key, cardId);
    changed = [key];
    if (sc.phase === 'setup') {
      sc.slots[key].locked = true;
      if (key === 'core' && sc.setupStage === 'core') sc.setupStage = 'cards';
      return;
    }
    if (key === 'truth') changed.push(...resolveTruthConflicts(deck, sc, rng));
    if (key === 'core') misfits = coreMisfits(deck, sc);
  });
  return { changed, misfits };
}

/** 依餘韻重抽不搭的真相與結局 */
export function refitCore(keys: readonly string[]): string[] {
  let changed: string[] = [];
  act((sc, deck) => {
    changed = refitToCore(deck, sc, keys, rng);
  });
  return changed;
}

export function toggleLock(key: string): void {
  act((sc) => {
    if (sc.slots[key]?.card) sc.slots[key].locked = !sc.slots[key].locked;
  });
}

/** 全部重抽（鎖定的與 PC 的卡不動） */
export function redrawAll(): string[] {
  let changed: string[] = [];
  act((sc, deck) => {
    changed = drawStory(deck, sc, rng);
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
  act((sc, deck) => {
    changed = applyThemeChange(deck, sc, mission, tone, targets, rng);
  });
  return changed;
}

/* ---------- 角色 ---------- */

export function drawPc(pc?: number): string[] {
  let keys: string[] = [];
  act((sc, deck) => {
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
  act((sc) => {
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
  act((sc) => {
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
  act((sc) => {
    sc.extras = sc.extras.filter((n) => n.id !== id);
    for (const p of sc.pcs) if (p.target === id) p.target = null;
  });
}

/* ---------- 回答 ---------- */

export function writeReply(key: string, text: string): void {
  edit((sc) => writeAnswer(sc, key, text));
}

export function writePrompt(key: string, text: string): void {
  edit((sc, deck) => writeQuestion(deck, sc, key, text));
}

export function restorePrompt(key: string): void {
  act((sc) => {
    delete sc.questions[key];
  });
}

/** 給個例子（回傳填上的文字） */
export function exampleReplyFor(key: string): string {
  let text = '';
  act((sc, deck) => {
    text = pickExampleReply(deck, sc, key, rng);
    if (text) writeAnswer(sc, key, text);
  });
  return text;
}

/**
 * 空白的回答先放例子。withNpc：「角色」那一步的按鈕（NPC 卡的回答、還沒取名的 NPC 也填上名字）。回傳填了幾題
 */
export function fillAnswers(keys: readonly string[], withNpc = false): number {
  let n = 0;
  act((sc, deck) => {
    const list = withNpc ? [...keys, 'npc'] : keys;
    for (const k of list) {
      if (!sc.slots[k]?.card || replyOf(sc, k)) continue;
      const t = pickExampleReply(deck, sc, k, rng);
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
  act((sc) => {
    if (sc.phase === 'done') sc.step = step;
  });
}

export function setTitle(title: string): void {
  edit((sc) => {
    sc.title = title.slice(0, 60);
  });
}

/* ---------- 推理與場景 ---------- */

export function draftFromCards(): void {
  act((sc, deck) => {
    sc.plot = draftPlot(deck, sc);
  });
}

export function startBlankPlot(): void {
  act((sc) => {
    sc.plot = blankPlot();
  });
}

export function addDeduction(): string {
  const id = uid('n');
  act((sc) => {
    sc.plot.deductions.push({ id, text: '' });
  });
  return id;
}

export function addScene(): string {
  const id = uid('s');
  act((sc) => {
    sc.plot.scenes.push({ id, name: '', place: '', what: '' });
  });
  return id;
}

export function addClue(scene = ''): string {
  const id = uid('c');
  act((sc) => {
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
  act((sc) => {
    const c = sc.plot.clues.find((x) => x.id === id);
    if (c) c.scene = sc.plot.scenes.some((s) => s.id === scene) ? scene : '';
  });
}

export function toggleClueLink(id: string, deduction: string): void {
  act((sc) => {
    const c: Clue | undefined = sc.plot.clues.find((x) => x.id === id);
    if (!c) return;
    c.links = c.links.includes(deduction)
      ? c.links.filter((x) => x !== deduction)
      : [...c.links, deduction];
  });
}

export function moveSceneBy(id: string, dir: -1 | 1): void {
  act((sc) => {
    moveScene(sc.plot, id, dir);
  });
}

export function removePlot(kind: 'deduction' | 'scene' | 'clue', id: string): void {
  act((sc) => removePlotItem(sc.plot, kind, id));
}

/* ---------- 我的劇本 ---------- */

export function openScenario(id: string, step?: Step): void {
  oneStep(() => {
    usePlot.getState().update((d) => {
      if (!d.scenarios.some((s) => s.id === id)) return;
      d.current = id;
      const sc = d.scenarios.find((s) => s.id === id);
      if (sc && step && sc.phase === 'done') sc.step = step;
      prune(d);
    });
  });
}

/** 改劇本名（我的劇本裡打字；連續的變更合併成一步） */
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
  oneStep(() =>
    usePlot.getState().update((d) => {
      d.scenarios.unshift(copy);
    }),
  );
  return copy;
}

/** 刪掉一份；刪的是目前這份時開一份新的（同一個卡組） */
export function deleteScenario(id: string): void {
  oneStep(() => {
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
  });
}

/* ---------- 卡庫 ---------- */

export type CatalogStart = { ok: false } | { ok: true; droppedTone: string | null };

/**
 * 用卡庫放進去的卡開始一份新的劇本：放的卡放進欄並鎖定，其他的抽。
 * 氣氛由餘韻決定（不管放的順序）；沒放餘韻時由焦點決定。焦點的氣氛和餘韻不同時，那張焦點不放（回傳它的卡名，
 * 畫面上通知），由抽卡換一張同氣氛的。題材沒決定時先決定。超過上限時 ok: false
 */
export function startFromCatalog(
  deck: DeckId,
  picks: Partial<Record<CardCat, string>>,
): CatalogStart {
  return oneStep(() => {
    if (!beginScenarioNow(deck)) return { ok: false };
    let droppedTone: string | null = null;
    edit((sc, d) => {
      clearCards(sc);
      sc.deck = deck;
      const cards = Object.entries(picks)
        .map(([cat, id]) => ({ cat, card: findCard(d, id) }))
        .filter(
          (x): x is { cat: string; card: NonNullable<ReturnType<typeof findCard>> } =>
            !!x.card && x.card.cat === x.cat && !belongsToPc(x.card.cat),
        )
        .map((x) => x.card);
      const core = cards.find((c) => c.cat === 'core');
      const toneCard = cards.find((c) => c.cat === 'tone');
      sc.tone = core?.tones?.[0] ?? toneCard?.tones?.[0] ?? sc.tone;
      for (const card of cards) {
        if (card.cat === 'tone' && sc.tone && !card.tones?.includes(sc.tone)) {
          droppedTone = card.title;
          continue;
        }
        setSlotCard(sc, card.cat, card.id);
        sc.slots[card.cat].locked = true;
      }
      settleMissionTone(d, sc, rng);
      sc.madeBy = 'catalog';
      sc.phase = 'done';
      sc.step = 'cards';
      drawStory(d, sc, rng);
    });
    return { ok: true, droppedTone };
  });
}

/* ---------- 專案檔與重設 ---------- */

/** 開啟專案檔：加進清單、變成目前的劇本（id 換新的，不會蓋掉清單裡的） */
export function addLoadedScenario(sc: Scenario): void {
  oneStep(() => {
    const now = Date.now();
    const copy: Scenario = { ...sc, id: uid('s', now), updated: now };
    usePlot.getState().update((d) => {
      d.scenarios.unshift(copy);
      d.current = copy.id;
      prune(d);
      if (d.scenarios.length > LIBRARY_MAX) d.scenarios = d.scenarios.slice(0, LIBRARY_MAX);
    });
  });
}

/** 重設目前的劇本：回到開始的畫面（卡組、題材、氣氛、PC 人數與秘密卡留著） */
export function resetCurrent(): void {
  act((sc) => {
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
