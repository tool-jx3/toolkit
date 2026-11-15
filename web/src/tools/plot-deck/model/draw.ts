/**
 * 抽卡：卡的權重（偏好）、抽一張、全部抽、真相或體驗的核心換掉之後的連動、題材與氣氛換掉之後的連動、發三張核心。
 * 數值照 Kadan 的做法（規格第 3.2 節）；亂數由呼叫端給（`rng: () => [0, 1)`），單元測試用種子重現。
 * 會改到劇本的函式都直接改傳進來的物件（store 裡是 Immer 的 draft）。
 */
import {
  ANY,
  type Card,
  type CardCat,
  cardsOf,
  type Deck,
  findCard,
  findMission,
  findTone,
  isPcCat,
} from '../data';
import {
  activeKeys,
  answerOf,
  isPcKey,
  pcKeys,
  type Scenario,
  STORY_KEYS,
  setSlotCard,
  slotCard,
  slotCat,
} from './scenario';

export type Rng = () => number;

/** 題材或氣氛合不合：null＝還沒決定、2＝全部都合（沒有標或標 *）、1＝合、0＝不合 */
export function fitOf(list: readonly string[] | undefined, k: string | null): 0 | 1 | 2 | null {
  if (!k) return null;
  if (!list?.length || list.includes(ANY)) return 2;
  return list.includes(k) ? 1 : 0;
}

/**
 * 題材與氣氛的權重：
 * - PC 的卡 1；
 * - 體驗的核心：氣氛不同 0（抽不到），題材合 6、其他 1；
 * - 氣氛卡：氣氛不同 0，題材合 3、其他 1；
 * - 其他：題材與氣氛都不合 0.05；合 ×6、全部都合 ×2、還沒決定 ×1（兩個相乘）。
 */
export function tagWeight(card: Card, mission: string | null, tone: string | null): number {
  if (isPcCat(card.cat)) return 1;
  if (card.cat === 'core') {
    if (tone && !(card.tones ?? []).includes(tone)) return 0;
    return mission && (card.missions ?? []).includes(mission) ? 6 : 1;
  }
  if (card.cat === 'tone') {
    if (tone && !(card.tones ?? []).includes(tone)) return 0;
    return fitOf(card.missions, mission) === 1 ? 3 : 1;
  }
  const fm = fitOf(card.missions, mission);
  const ft = fitOf(card.tones, tone);
  if (fm === 0 && ft === 0) return 0.05;
  const v = (f: 0 | 1 | 2 | null) => (f === 1 ? 6 : f === 2 ? 2 : 1);
  return (fm === 0 ? 1 : v(fm)) * (ft === 0 ? 1 : v(ft));
}

/** 這張卡合不合目前的體驗的核心（真相、結局才有） */
export function fitsCore(deck: Deck, sc: Scenario, card: Card): boolean {
  const core = slotCard(deck, sc, 'core');
  if (!core) return false;
  if (card.cat === 'truth') return (core.truths ?? []).includes(card.id);
  if (card.cat === 'ending') return (core.endings ?? []).includes(card.id);
  return false;
}

/** 舞台的種類都不合（舞台抽到之後，標了適合種類的卡） */
export function stageMismatch(deck: Deck, sc: Scenario, card: Card): boolean {
  if (!card.fits?.length) return false;
  const stage = slotCard(deck, sc, 'stage');
  if (!stage?.kinds?.length) return false;
  return !card.fits.some((k) => stage.kinds?.includes(k));
}

const listed = (
  links: Card['links'],
  kind: 'prefer' | 'avoid',
  cat: CardCat,
  id: string,
): boolean => !!links?.[kind]?.[cat]?.includes(id);

/**
 * 一張卡的權重（0＝不會抽到）：題材與氣氛 × 合體驗的核心 18 × 舞台的種類不合 0.06 × 真相的相性：
 * - 真相：和鎖定的卡合不來 0、合得來 ×2（每張）；
 * - 其他：和目前的真相合不來 0、合得來 ×4。
 */
export function weightOf(deck: Deck, sc: Scenario, card: Card): number {
  let w = tagWeight(card, sc.mission, sc.tone);
  if (card.cat === 'core' || w === 0) return w;
  if (fitsCore(deck, sc, card)) w *= 18;
  if (stageMismatch(deck, sc, card)) w *= 0.06;
  if (card.cat === 'truth') {
    for (const key of activeKeys(sc)) {
      const slot = sc.slots[key];
      if (!slot?.locked || !slot.card || key === 'truth') continue;
      const cat = slotCat(key);
      if (listed(card.links, 'avoid', cat, slot.card)) return 0;
      if (listed(card.links, 'prefer', cat, slot.card)) w *= 2;
    }
    return w;
  }
  const truth = slotCard(deck, sc, 'truth');
  if (truth) {
    if (listed(truth.links, 'avoid', card.cat, card.id)) return 0;
    if (listed(truth.links, 'prefer', card.cat, card.id)) w *= 4;
  }
  return w;
}

export type Reason =
  | { kind: 'core' }
  | { kind: 'truth' }
  | { kind: 'locked' }
  | { kind: 'mission'; name: string }
  | { kind: 'tone'; name: string };

/** 合得來的理由（卡上的小標、清單的說明） */
export function reasonsOf(deck: Deck, sc: Scenario, card: Card): Reason[] {
  const out: Reason[] = [];
  if (fitsCore(deck, sc, card)) out.push({ kind: 'core' });
  if (card.cat === 'truth') {
    const hit = activeKeys(sc).some((key) => {
      const slot = sc.slots[key];
      return (
        key !== 'truth' &&
        !!slot?.locked &&
        !!slot.card &&
        listed(card.links, 'prefer', slotCat(key), slot.card)
      );
    });
    if (hit) out.push({ kind: 'locked' });
  } else if (!isPcCat(card.cat)) {
    const truth = slotCard(deck, sc, 'truth');
    if (truth && listed(truth.links, 'prefer', card.cat, card.id)) out.push({ kind: 'truth' });
  }
  if (isPcCat(card.cat)) return out;
  const m = findMission(deck, sc.mission);
  const t = findTone(deck, sc.tone);
  const missions = card.missions ?? [];
  if (m && missions.includes(m.id)) out.push({ kind: 'mission', name: m.name });
  if (t && card.cat !== 'core' && card.cat !== 'tone' && (card.tones ?? []).includes(t.id))
    out.push({ kind: 'tone', name: t.name });
  return out;
}

/** 同一種卡在別的欄用掉的（PC 的關係、秘密每人一張，不重複） */
function usedElsewhere(sc: Scenario, key: string): Set<string> {
  const cat = slotCat(key);
  const out = new Set<string>();
  for (const k of activeKeys(sc)) {
    if (k === key || slotCat(k) !== cat) continue;
    const c = sc.slots[k]?.card;
    if (c) out.add(c);
  }
  return out;
}

export function weightedPick<T>(items: readonly (readonly [T, number])[], rng: Rng): T | null {
  const total = items.reduce((a, [, w]) => a + w, 0);
  if (!items.length || total <= 0) return null;
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

/**
 * 抽一張放進欄：同一種卡別的欄用掉的不抽；avoidSelf 時也不抽現在這張（重抽）。
 * 權重都是 0 時，從還沒用掉的卡平均抽；一張都沒有時不動。回傳抽到的卡 id。
 */
export function pickCard(
  deck: Deck,
  sc: Scenario,
  key: string,
  rng: Rng,
  avoidSelf = false,
): string | null {
  const used = usedElsewhere(sc, key);
  const cur = sc.slots[key]?.card ?? null;
  if (avoidSelf && cur) used.add(cur);
  const free = cardsOf(deck, slotCat(key)).filter((c) => !used.has(c.id));
  const weighted = free.map((c) => [c.id, weightOf(deck, sc, c)] as const).filter(([, w]) => w > 0);
  const id =
    weightedPick(weighted, rng) ??
    weightedPick(
      free.map((c) => [c.id, 1] as const),
      rng,
    );
  if (!id) return cur;
  setSlotCard(sc, key, id);
  return id;
}

/** 全部抽（鎖定的與 PC 的卡不動）：先體驗的核心、真相、舞台，再抽其他 */
export function drawAll(deck: Deck, sc: Scenario, rng: Rng): string[] {
  const keys = STORY_KEYS.filter((k) => !sc.slots[k].locked);
  for (const k of keys) setSlotCard(sc, k, null);
  const first = ['core', 'truth', 'stage'] as const;
  for (const k of first) if (keys.includes(k)) pickCard(deck, sc, k, rng);
  for (const k of keys) if (!(first as readonly string[]).includes(k)) pickCard(deck, sc, k, rng);
  return keys;
}

/** 還沒抽的故事的卡補抽（PC 人數改了、讀進舊的資料時） */
export function fillMissing(deck: Deck, sc: Scenario, rng: Rng): string[] {
  const keys = STORY_KEYS.filter((k) => !sc.slots[k].card);
  const first = ['core', 'truth', 'stage'];
  const ordered = [
    ...first.filter((k) => keys.includes(k as never)),
    ...keys.filter((k) => !first.includes(k)),
  ];
  for (const k of ordered) pickCard(deck, sc, k, rng);
  return ordered;
}

/** 真相換了之後：沒鎖定的卡裡和新真相合不來的（權重 0）重抽。回傳換掉的欄 */
export function fixAfterTruth(deck: Deck, sc: Scenario, rng: Rng): string[] {
  const changed: string[] = [];
  for (const k of activeKeys(sc)) {
    if (k === 'truth' || k === 'core') continue;
    const slot = sc.slots[k];
    const card = findCard(deck, slot.card);
    if (slot.locked || !card) continue;
    if (weightOf(deck, sc, card) === 0) {
      pickCard(deck, sc, k, rng, true);
      changed.push(k);
    }
  }
  return changed;
}

/** 體驗的核心換了之後，和新核心合不來的真相與結局（沒鎖定的） */
export function coreMisfits(deck: Deck, sc: Scenario): string[] {
  return (['truth', 'ending'] as const).filter((k) => {
    const slot = sc.slots[k];
    const card = findCard(deck, slot.card);
    return !!card && !slot.locked && !fitsCore(deck, sc, card);
  });
}

/** 依新的核心重抽合不來的真相與結局（真相換了也連動）。回傳換掉的欄 */
export function refitToCore(deck: Deck, sc: Scenario, keys: readonly string[], rng: Rng): string[] {
  const changed = new Set<string>();
  if (keys.includes('truth')) {
    pickCard(deck, sc, 'truth', rng, true);
    changed.add('truth');
    for (const k of fixAfterTruth(deck, sc, rng)) changed.add(k);
  }
  if (keys.includes('ending') && !changed.has('ending')) {
    pickCard(deck, sc, 'ending', rng, true);
    changed.add('ending');
  }
  return [...changed];
}

/**
 * 換題材與氣氛時要重抽的欄：氣氛變了，體驗的核心與氣氛卡一定要換（鎖定的也換）；
 * 其他沒鎖定的故事的卡，題材與氣氛都不合（權重不到 0.1）的也換。
 */
export function missionToneTargets(
  deck: Deck,
  sc: Scenario,
  mission: string | null,
  tone: string | null,
): { must: string[]; optional: string[] } {
  const toneChanged = tone !== sc.tone;
  const must = toneChanged
    ? (['core', 'tone'] as const).filter((k) => !!sc.slots[k].card).map(String)
    : [];
  const optional = STORY_KEYS.filter((k) => {
    if (must.includes(k)) return false;
    const slot = sc.slots[k];
    const card = findCard(deck, slot.card);
    return !!card && !slot.locked && tagWeight(card, mission, tone) < 0.1;
  }).map(String);
  return { must, optional };
}

/** 換題材與氣氛，重抽 targets。回傳換掉的欄 */
export function applyMissionTone(
  deck: Deck,
  sc: Scenario,
  mission: string | null,
  tone: string | null,
  targets: readonly string[],
  rng: Rng,
): string[] {
  sc.mission = mission;
  sc.tone = tone;
  const changed = new Set<string>();
  for (const k of targets) sc.slots[k].locked = false;
  if (targets.includes('core')) {
    pickCard(deck, sc, 'core', rng, true);
    changed.add('core');
  }
  if (targets.includes('truth')) {
    pickCard(deck, sc, 'truth', rng, true);
    changed.add('truth');
  }
  for (const k of targets) {
    if (k === 'core' || k === 'truth') continue;
    pickCard(deck, sc, k, rng, true);
    changed.add(k);
  }
  for (const k of fixAfterTruth(deck, sc, rng)) changed.add(k);
  return [...changed];
}

function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 發三張體驗的核心：同一種氣氛的（還沒決定氣氛時全部），題材也合的排前面；
 * 上一次發過的與目前選的排到最後（換三張時盡量不重複）。
 */
export function dealCores(deck: Deck, sc: Scenario, rng: Rng, count = 3): string[] {
  const avoid = new Set([...sc.coreDeal, sc.slots.core.card ?? '']);
  const all = cardsOf(deck, 'core').filter((c) => !sc.tone || (c.tones ?? []).includes(sc.tone));
  const both = all.filter((c) => !!sc.mission && (c.missions ?? []).includes(sc.mission));
  const rest = all.filter((c) => !both.includes(c));
  const order = (list: Card[]) => [
    ...shuffle(
      list.filter((c) => !avoid.has(c.id)),
      rng,
    ),
    ...shuffle(
      list.filter((c) => avoid.has(c.id)),
      rng,
    ),
  ];
  return [...order(both), ...order(rest)].slice(0, count).map((c) => c.id);
}

/** 決定還沒決定的題材與氣氛（「交給系統」） */
export function settleMissionTone(deck: Deck, sc: Scenario, rng: Rng): void {
  if (!findMission(deck, sc.mission))
    sc.mission = deck.missions[Math.floor(rng() * deck.missions.length)].id;
  if (!findTone(deck, sc.tone)) sc.tone = deck.tones[Math.floor(rng() * deck.tones.length)].id;
}

/** 抽 PC 的卡（pc 給了只抽那位；已經有卡的不動）。回傳抽了的欄 */
export function drawPcCards(deck: Deck, sc: Scenario, rng: Rng, pc?: number): string[] {
  const keys = pcKeys(sc, pc).filter((k) => !sc.slots[k].card);
  for (const k of keys) pickCard(deck, sc, k, rng);
  return keys;
}

/**
 * 換卡會丟掉的回答：這些欄裡已經回答的；真相也在裡面時，換真相會連動其他沒鎖定的卡，
 * 那些卡的回答也算（同 Kadan：先算進去、確認後才換）。
 */
export function answersAtRisk(sc: Scenario, keys: readonly string[]): string[] {
  const lose = new Set(keys.filter((k) => !!answerOf(sc, k)));
  if (keys.includes('truth'))
    for (const k of activeKeys(sc)) {
      if (k !== 'truth' && !sc.slots[k].locked && !isPcKey(k) && answerOf(sc, k)) lose.add(k);
    }
  return [...lose];
}

/** 隨機回答：從這張卡的回答例子挑一個（和現在的回答不同） */
export function randomAnswer(deck: Deck, sc: Scenario, key: string, rng: Rng): string {
  const card = slotCard(deck, sc, key);
  if (!card) return '';
  const cur = answerOf(sc, key);
  const pool = card.answers.filter((a) => a !== cur);
  const list = pool.length ? pool : card.answers;
  return list[Math.floor(rng() * list.length)] ?? '';
}
