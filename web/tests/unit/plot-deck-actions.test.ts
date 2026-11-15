/**
 * 劇本骨架抽卡（plot-deck）的動作與 store：一次抽齊、先挑餘韻（餘韻 → 放上想要的卡 → 抽完其餘的）、
 * 自己挑、鎖定與重抽、換卡組、我的劇本（新的、複製、刪除、開啟）、從卡庫開始（餘韻決定氣氛）、
 * 專案檔讀入與重設、復原（一次性的動作各一步，打字合併）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import {
  addLoadedScenario,
  beginScenario,
  chooseCore,
  currentNow,
  deleteScenario,
  duplicateScenario,
  ensureCurrent,
  fillAnswers,
  libraryOf,
  openScenario,
  pickFromList,
  redrawAll,
  reroll,
  resetCurrent,
  setDeck,
  setMission,
  setTone,
  setupDraw,
  startFromCatalog,
  startRandom,
  startSetup,
  stateNow,
  toggleLock,
  writeReply as writeReplyAction,
} from '@/tools/plot-deck/actions';
import { findCard, getDeck } from '@/tools/plot-deck/data';
import {
  initialState,
  PROJECT_VERSION,
  scenarioFromProject,
  TOOL_ID,
} from '@/tools/plot-deck/model/project';
import { replyOf, STORY_KEYS, writeReply } from '@/tools/plot-deck/model/scenario';
import { usePlot } from '@/tools/plot-deck/store';

beforeEach(() => {
  usePlot.getState().replace(initialState);
  usePlot.temporal.getState().clear();
  ensureCurrent();
});

const cur = () => {
  const sc = currentNow();
  if (!sc) throw new Error('沒有目前的劇本');
  return sc;
};
const undo = () => usePlot.temporal.getState().undo();

describe('開始', () => {
  it('開頁有一份空的劇本（不在清單裡）', () => {
    expect(cur().phase).toBe('start');
    expect(libraryOf(stateNow())).toEqual([]);
  });

  it('一次抽齊：沒選的題材與氣氛先決定，全部抽好', () => {
    setMission('riddle');
    startRandom();
    const sc = cur();
    expect(sc.phase).toBe('done');
    expect(sc.madeBy).toBe('random');
    expect(sc.mission).toBe('riddle');
    expect(sc.tone).toBeTruthy();
    for (const k of STORY_KEYS) expect(sc.slots[k].card).toBeTruthy();
    expect(libraryOf(stateNow())).toHaveLength(1);
  });

  it('先挑餘韻：三張餘韻 → 選一張（鎖定）→ 放上想要的卡（鎖定）→ 抽完其餘的', () => {
    setMission('getaway');
    setTone('tense');
    startSetup();
    let sc = cur();
    expect(sc.phase).toBe('setup');
    expect(sc.coreOffer).toHaveLength(3);
    chooseCore(sc.coreOffer[1]);
    sc = cur();
    expect(sc.setupStage).toBe('cards');
    expect(sc.slots.core).toEqual({ card: sc.coreOffer[1], locked: true });
    pickFromList('stage', 'stage.fishfarm');
    expect(cur().slots.stage).toEqual({ card: 'stage.fishfarm', locked: true });
    setupDraw();
    sc = cur();
    expect(sc.phase).toBe('done');
    expect(sc.slots.stage.card).toBe('stage.fishfarm');
    for (const k of STORY_KEYS) expect(sc.slots[k].card).toBeTruthy();
  });
});

describe('抽好之後', () => {
  it('重抽、鎖定（鎖定的不能重抽，全部重抽也留著）', () => {
    startRandom();
    const before = cur().slots.clue.card;
    expect(reroll('clue').changed).toEqual(['clue']);
    expect(cur().slots.clue.card).not.toBe(before);
    toggleLock('clue');
    const locked = cur().slots.clue.card;
    expect(reroll('clue').changed).toEqual([]);
    redrawAll();
    expect(cur().slots.clue.card).toBe(locked);
  });

  it('自己挑：換真相時合不來的卡一起換；換餘韻時回傳不搭的真相與結局', () => {
    startRandom();
    usePlot.getState().update((d) => {
      const sc = d.scenarios.find((s) => s.id === d.current);
      if (sc) sc.slots.stage.card = 'stage.fishfarm';
    });
    expect(pickFromList('truth', 'truth.sparekey').changed).toContain('stage');
    const deck = getDeck('modern');
    const core = findCard(deck, cur().slots.core.card);
    const other = deck.cards.find(
      (c) =>
        c.cat === 'core' &&
        c.tones?.[0] === core?.tones?.[0] &&
        !c.truths?.includes(cur().slots.truth.card ?? ''),
    );
    if (other) expect(pickFromList('core', other.id).misfits).toContain('truth');
    /* 種類不對的卡不會放進去 */
    pickFromList('stage', 'npc.taxi');
    expect(cur().slots.stage.card?.startsWith('stage.')).toBe(true);
  });

  it('復原：抽卡後馬上重抽也是兩步；連按兩次重抽是兩步（L3）', () => {
    startRandom();
    const first = cur().slots.intro.card;
    reroll('intro');
    const second = cur().slots.intro.card;
    expect(second).not.toBe(first);
    reroll('intro');
    expect(cur().slots.intro.card).not.toBe(second);
    undo();
    expect(cur().slots.intro.card).toBe(second);
    undo();
    expect(cur().slots.intro.card).toBe(first);
    expect(cur().phase).toBe('done');
    undo();
    expect(cur().phase).toBe('start');
  });

  it('復原：鎖定、自己挑、刪除、切換劇本各一步；打字照樣合併成一步', () => {
    startRandom();
    const a = cur().id;
    /* 挑一張和抽到的不同的 NPC（抽到的剛好是那張時，挑卡不算一步） */
    const npc = cur().slots.npc.card === 'npc.taxi' ? 'npc.locksmith' : 'npc.taxi';
    toggleLock('stage');
    pickFromList('npc', npc);
    writeReplyAction('intro', '一');
    writeReplyAction('intro', '一二');
    writeReplyAction('intro', '一二三');
    expect(replyOf(cur(), 'intro')).toBe('一二三');
    undo();
    expect(replyOf(cur(), 'intro')).toBe('');
    expect(cur().slots.npc.card).toBe(npc);
    undo();
    expect(cur().slots.npc.card).not.toBe(npc);
    expect(cur().slots.stage.locked).toBe(true);
    undo();
    expect(cur().slots.stage.locked).toBe(false);
    beginScenario();
    startRandom();
    const b = cur().id;
    openScenario(a);
    expect(cur().id).toBe(a);
    undo();
    expect(cur().id).toBe(b);
    deleteScenario(b);
    expect(stateNow().scenarios.some((s) => s.id === b)).toBe(false);
    undo();
    expect(stateNow().scenarios.some((s) => s.id === b)).toBe(true);
  });

  it('空白的回答先放例子（角色那一步也替 NPC 取名）', () => {
    startRandom();
    usePlot.getState().update((d) => {
      const sc = d.scenarios.find((s) => s.id === d.current);
      if (sc) writeReply(sc, 'truth', '自己寫的');
    });
    fillAnswers(STORY_KEYS);
    const sc = cur();
    expect(replyOf(sc, 'truth')).toBe('自己寫的');
    for (const k of STORY_KEYS) expect(replyOf(sc, k)).not.toBe('');
    fillAnswers([], true);
    expect(getDeck('modern').names).toContain(cur().npc.name);
  });
});

describe('我的劇本與卡組', () => {
  it('換卡組：還沒抽卡就地換；抽過卡另開一份（原本的留在清單）', () => {
    setDeck('fantasy');
    expect(cur().deck).toBe('fantasy');
    expect(stateNow().scenarios).toHaveLength(1);
    startRandom();
    const first = cur().id;
    setDeck('modern');
    expect(cur().deck).toBe('modern');
    expect(cur().id).not.toBe(first);
    expect(cur().phase).toBe('start');
    expect(libraryOf(stateNow()).map((s) => s.id)).toEqual([first]);
  });

  it('新的劇本、開啟、複製一份、刪除（刪目前這份時開一份新的）', () => {
    startRandom();
    const a = cur().id;
    expect(beginScenario()).toBe(true);
    startRandom();
    const b = cur().id;
    expect(libraryOf(stateNow())).toHaveLength(2);
    openScenario(a, 'sheet');
    expect(cur().id).toBe(a);
    expect(cur().step).toBe('sheet');
    const copy = duplicateScenario(a, '又一份');
    expect(copy?.title).toBe('又一份');
    expect(libraryOf(stateNow())).toHaveLength(3);
    expect(cur().id).toBe(a);
    deleteScenario(b);
    expect(libraryOf(stateNow())).toHaveLength(2);
    deleteScenario(a);
    expect(cur().phase).toBe('start');
    expect(libraryOf(stateNow()).map((s) => s.id)).toEqual([copy?.id]);
  });

  it('從卡庫開始：放的卡鎖定，氣氛跟著放的餘韻', () => {
    const r = startFromCatalog('fantasy', {
      core: 'core.respect',
      stage: 'stage.shipinn',
      relation: 'relation.jailbreak',
    });
    expect(r).toEqual({ ok: true, droppedTone: null });
    const sc = cur();
    expect(sc.deck).toBe('fantasy');
    expect(sc.madeBy).toBe('catalog');
    expect(sc.tone).toBe('legend');
    expect(sc.slots.core).toEqual({ card: 'core.respect', locked: true });
    expect(sc.slots.stage).toEqual({ card: 'stage.shipinn', locked: true });
    expect(sc.slots.rel1.card).toBeNull();
    expect(findCard(getDeck('fantasy'), sc.slots.tone.card)?.tones).toEqual(['legend']);
  });

  it('從卡庫開始：餘韻和焦點的氣氛不同時，不管放的順序都由餘韻決定，焦點換一張（M2）', () => {
    const orders = [
      { core: 'core.respect', tone: 'tone.pumpkin' },
      { tone: 'tone.pumpkin', core: 'core.respect' },
    ];
    for (const picks of orders) {
      const r = startFromCatalog('fantasy', picks);
      expect(r).toEqual({ ok: true, droppedTone: '一直變大的南瓜' });
      const sc = cur();
      expect(sc.tone).toBe('legend');
      expect(sc.slots.core).toEqual({ card: 'core.respect', locked: true });
      expect(sc.slots.tone.card).not.toBe('tone.pumpkin');
      expect(sc.slots.tone.locked).toBe(false);
      expect(findCard(getDeck('fantasy'), sc.slots.tone.card)?.tones).toEqual(['legend']);
    }
    /* 只放焦點：氣氛跟著焦點，焦點留著 */
    const only = startFromCatalog('fantasy', { tone: 'tone.pumpkin' });
    expect(only).toEqual({ ok: true, droppedTone: null });
    expect(cur().tone).toBe('romp');
    expect(cur().slots.tone).toEqual({ card: 'tone.pumpkin', locked: true });
  });
});

describe('專案檔與重設', () => {
  it('存成專案檔再讀回：加進清單、變成目前的劇本（id 換新的）', () => {
    startRandom();
    const sc = cur();
    const text = serializeProject(TOOL_ID, PROJECT_VERSION, { scenario: sc });
    const file = parseProject(text, TOOL_ID);
    const loaded = scenarioFromProject(file.data, file.version);
    addLoadedScenario(loaded);
    const now = cur();
    expect(now.id).not.toBe(sc.id);
    expect({ ...now, id: sc.id, updated: sc.updated }).toEqual(sc);
    expect(libraryOf(stateNow())).toHaveLength(2);
  });

  it('重設這份劇本：回到開始畫面，卡組與題材留著', () => {
    setTone('dread');
    startRandom();
    resetCurrent();
    const sc = cur();
    expect(sc.phase).toBe('start');
    expect(sc.tone).toBe('dread');
    expect(STORY_KEYS.every((k) => !sc.slots[k].card)).toBe(true);
  });
});
