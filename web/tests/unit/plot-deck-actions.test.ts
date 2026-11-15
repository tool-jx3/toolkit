/**
 * 劇本骨架抽卡（plot-deck）的動作與 store：隨機抽、照條件抽（核心 → 想先決定的卡 → 抽剩下的）、
 * 從清單挑、鎖定與重抽、換卡組、劇本清單（新的、複製、刪除、打開）、卡片一覽開始、專案檔讀入與重設、復原。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '@/core/storage';
import {
  addLoadedScenario,
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
  startNew,
  startRandom,
  startSetup,
  stateNow,
  toggleLock,
} from '@/tools/plot-deck/actions';
import { findCard, getDeck } from '@/tools/plot-deck/data';
import {
  initialState,
  PROJECT_VERSION,
  scenarioFromProject,
  TOOL_ID,
} from '@/tools/plot-deck/model/project';
import { answerOf, STORY_KEYS, setAnswer } from '@/tools/plot-deck/model/scenario';
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

describe('開始', () => {
  it('開頁有一份空的劇本（不在清單裡）', () => {
    expect(cur().phase).toBe('start');
    expect(libraryOf(stateNow())).toEqual([]);
  });

  it('隨機抽：沒選的題材與氣氛交給系統，全部抽好', () => {
    setMission('inv');
    startRandom();
    const sc = cur();
    expect(sc.phase).toBe('done');
    expect(sc.madeBy).toBe('random');
    expect(sc.mission).toBe('inv');
    expect(sc.tone).toBeTruthy();
    for (const k of STORY_KEYS) expect(sc.slots[k].card).toBeTruthy();
    expect(libraryOf(stateNow())).toHaveLength(1);
  });

  it('照條件抽：三張核心 → 選一張（鎖定）→ 挑想先決定的卡（鎖定）→ 抽剩下的', () => {
    setMission('chase');
    setTone('noir');
    startSetup();
    let sc = cur();
    expect(sc.phase).toBe('setup');
    expect(sc.coreDeal).toHaveLength(3);
    chooseCore(sc.coreDeal[1]);
    sc = cur();
    expect(sc.setupStep).toBe('cards');
    expect(sc.slots.core).toEqual({ card: sc.coreDeal[1], locked: true });
    pickFromList('stage', 'stage.market');
    expect(cur().slots.stage).toEqual({ card: 'stage.market', locked: true });
    setupDraw();
    sc = cur();
    expect(sc.phase).toBe('done');
    expect(sc.slots.stage.card).toBe('stage.market');
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

  it('從清單挑：換真相時合不來的卡一起換；換核心時回傳合不來的真相與結局', () => {
    startRandom();
    usePlot.getState().update((d) => {
      const sc = d.scenarios.find((s) => s.id === d.current);
      if (sc) sc.slots.npc.card = 'npc.collector';
    });
    expect(pickFromList('truth', 'truth.experiment').changed).toContain('npc');
    const deck = getDeck('modern');
    const core = findCard(deck, cur().slots.core.card);
    const other = getDeck('modern').cards.find(
      (c) =>
        c.cat === 'core' &&
        c.tones?.[0] === core?.tones?.[0] &&
        !c.truths?.includes(cur().slots.truth.card ?? ''),
    );
    if (other) expect(pickFromList('core', other.id).misfits).toContain('truth');
    /* 種類不對的卡不會放進去 */
    pickFromList('stage', 'npc.chief');
    expect(cur().slots.stage.card?.startsWith('stage.')).toBe(true);
  });

  it('復原：抽卡、重抽都能一步一步退回', () => {
    startRandom();
    const first = cur().slots.intro.card;
    usePlot.temporal.getState().clear();
    reroll('intro');
    expect(cur().slots.intro.card).not.toBe(first);
    usePlot.temporal.getState().undo();
    expect(cur().slots.intro.card).toBe(first);
  });

  it('沒回答的隨機填（PC 與 NPC 的一步也替 NPC 取名）', () => {
    startRandom();
    usePlot.getState().update((d) => {
      const sc = d.scenarios.find((s) => s.id === d.current);
      if (sc) setAnswer(sc, 'truth', '自己寫的');
    });
    fillAnswers(STORY_KEYS);
    const sc = cur();
    expect(answerOf(sc, 'truth')).toBe('自己寫的');
    for (const k of STORY_KEYS) expect(answerOf(sc, k)).not.toBe('');
    fillAnswers([], true);
    expect(getDeck('modern').names).toContain(cur().npc.name);
  });
});

describe('劇本清單與卡組', () => {
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

  it('新的劇本、打開、複製一份、刪除（刪目前這份時開一份新的）', () => {
    startRandom();
    const a = cur().id;
    expect(startNew()).toBe(true);
    startRandom();
    const b = cur().id;
    expect(libraryOf(stateNow())).toHaveLength(2);
    openScenario(a, 'sheet');
    expect(cur().id).toBe(a);
    expect(cur().step).toBe('sheet');
    const copy = duplicateScenario(a, '複本');
    expect(copy?.title).toBe('複本');
    expect(libraryOf(stateNow())).toHaveLength(3);
    expect(cur().id).toBe(a);
    deleteScenario(b);
    expect(libraryOf(stateNow())).toHaveLength(2);
    deleteScenario(a);
    expect(cur().phase).toBe('start');
    expect(libraryOf(stateNow()).map((s) => s.id)).toEqual([copy?.id]);
  });

  it('卡片一覽開始：挑的卡鎖定，氣氛跟著挑的核心', () => {
    startFromCatalog('fantasy', {
      core: 'core.devil',
      stage: 'stage.sewer',
      relation: 'relation.village',
    });
    const sc = cur();
    expect(sc.deck).toBe('fantasy');
    expect(sc.madeBy).toBe('catalog');
    expect(sc.tone).toBe('dark');
    expect(sc.slots.core).toEqual({ card: 'core.devil', locked: true });
    expect(sc.slots.stage).toEqual({ card: 'stage.sewer', locked: true });
    expect(sc.slots.rel1.card).toBeNull();
    expect(findCard(getDeck('fantasy'), sc.slots.tone.card)?.tones).toEqual(['dark']);
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

  it('重設這份劇本：回到開始的畫面，卡組與題材留著', () => {
    setTone('horror');
    startRandom();
    resetCurrent();
    const sc = cur();
    expect(sc.phase).toBe('start');
    expect(sc.tone).toBe('horror');
    expect(STORY_KEYS.every((k) => !sc.slots[k].card)).toBe(true);
  });
});
