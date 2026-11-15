/**
 * 劇本骨架抽卡（plot-deck）的邏輯：抽卡的偏好（權重）與種子、鎖定與重抽、真相與餘韻的連動、
 * 題材與氣氛的變更、發三張餘韻、PC 的關係與秘密、推理題與線索的健檢、專案檔往返與壞檔、匯出的文字、
 * 送去劇本排版台的 markdown（用劇本排版台的 mdParse 讀）。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import { ProjectFileError } from '@/core/storage';
import { cardsOf, DECKS, findCard } from '@/tools/plot-deck/data';
import {
  briefOf,
  documentHtml,
  editorMarkdown,
  fillTone,
  scenarioText,
} from '@/tools/plot-deck/model/document';
import {
  answersAtRisk,
  applyThemeChange,
  coreMisfits,
  drawPcCards,
  drawStory,
  drawWeight,
  fitLevel,
  missionToneTargets,
  offerCores,
  pickCard,
  pickExampleReply,
  reasonsOf,
  refitToCore,
  resolveTruthConflicts,
  themeWeight,
} from '@/tools/plot-deck/model/draw';
import {
  blankPlot,
  cluesFor,
  draftPlot,
  moveScene,
  needsDeleteConfirm,
  plotLabels,
  plotTextLines,
  removePlotItem,
  reviewPlot,
} from '@/tools/plot-deck/model/plot';
import {
  PROJECT_VERSION,
  sanitizeScenario,
  sanitizeState,
  scenarioFromProject,
} from '@/tools/plot-deck/model/project';
import {
  bondTargetName,
  bondTargetOf,
  fallbackTitle,
  newScenario,
  npcChoices,
  pcKeys,
  promptOf,
  replyOf,
  type Scenario,
  STORY_KEYS,
  setSlotCard,
  slotWho,
  writePrompt,
  writeReply,
} from '@/tools/plot-deck/model/scenario';
import { mdParse } from '@/tools/scenario-editor/model/md';
import { cellsRead } from '@/tools/scenario-editor/model/table';

const M = DECKS.modern;
const F = DECKS.fantasy;
const card = (id: string) => {
  const c = findCard(M, id) ?? findCard(F, id);
  if (!c) throw new Error(id);
  return c;
};

function drawn(seed = 'test', options: Partial<Scenario> = {}): Scenario {
  const sc = newScenario('modern', { mission: 'riddle', tone: 'dread', ...options });
  sc.phase = 'done';
  drawStory(M, sc, seededRandom(seed));
  return sc;
}

describe('權重（題材與氣氛）', () => {
  it('fitLevel：還沒決定 null、全部 2、合 1、不合 0', () => {
    expect(fitLevel(['riddle'], null)).toBeNull();
    expect(fitLevel(undefined, 'riddle')).toBe(2);
    expect(fitLevel(['*'], 'riddle')).toBe(2);
    expect(fitLevel(['riddle', 'guard'], 'guard')).toBe(1);
    expect(fitLevel(['riddle'], 'guard')).toBe(0);
  });

  it('餘韻：氣氛不同 0、題材合 6、其他 1', () => {
    const c = card('core.price'); /* dread；riddle、trespass、getaway */
    expect(themeWeight(c, 'riddle', 'tense')).toBe(0);
    expect(themeWeight(c, 'riddle', 'dread')).toBe(6);
    expect(themeWeight(c, 'deal', 'dread')).toBe(1);
    expect(themeWeight(c, null, null)).toBe(1);
  });

  it('焦點：氣氛不同 0、題材合 3、其他 1', () => {
    const c = card('tone.shadow'); /* dread；riddle、guard、getaway */
    expect(themeWeight(c, 'riddle', 'tender')).toBe(0);
    expect(themeWeight(c, 'riddle', 'dread')).toBe(3);
    expect(themeWeight(c, 'deal', 'dread')).toBe(1);
  });

  it('其他：都不合 0.05、合 ×6、全部 ×2、還沒決定 ×1', () => {
    const intro = card('intro.lockedout'); /* riddle、getaway、search；dread、absurd、tense */
    expect(themeWeight(intro, 'deal', 'tender')).toBe(0.05);
    expect(themeWeight(intro, 'riddle', 'dread')).toBe(36);
    expect(themeWeight(intro, 'riddle', null)).toBe(6);
    expect(themeWeight(intro, 'deal', 'dread')).toBe(6);
    const any = { ...card('clue.song'), tones: ['*'] }; /* 氣氛標了「全部」 */
    expect(themeWeight(any, 'riddle', 'dread')).toBe(12);
    expect(themeWeight(any, 'deal', 'dread')).toBe(2);
    expect(themeWeight(card('relation.cram'), 'riddle', 'dread')).toBe(1);
  });
});

describe('權重（餘韻、舞台、真相的相性）', () => {
  it('合餘韻的真相與結局 ×18；理由「跟餘韻搭」', () => {
    const sc = newScenario('modern', { mission: 'riddle', tone: 'dread' });
    setSlotCard(sc, 'core', 'core.price');
    const fit = card('truth.buried');
    const other = card('truth.insurance');
    expect(drawWeight(M, sc, fit)).toBe(themeWeight(fit, 'riddle', 'dread') * 18);
    expect(drawWeight(M, sc, other)).toBe(themeWeight(other, 'riddle', 'dread'));
    expect(reasonsOf(M, sc, fit)).toContainEqual({ kind: 'core' });
    expect(drawWeight(M, sc, card('ending.dawn'))).toBe(
      themeWeight(card('ending.dawn'), 'riddle', 'dread') * 18,
    );
  });

  it('舞台的種類都不合 ×0.06', () => {
    const sc = newScenario('modern', { mission: 'search', tone: 'tense' });
    setSlotCard(sc, 'stage', 'stage.fishfarm'); /* outskirts */
    const longtable = card('obstacle.longtable'); /* crowded */
    const guarddog = card('obstacle.guarddog'); /* outskirts、enclosed */
    expect(drawWeight(M, sc, longtable)).toBeCloseTo(
      themeWeight(longtable, 'search', 'tense') * 0.06,
    );
    expect(drawWeight(M, sc, guarddog)).toBe(themeWeight(guarddog, 'search', 'tense'));
  });

  it('真相抽到後：合得來 ×4、合不來 0（理由「跟真相搭」）', () => {
    const sc = newScenario('modern', { mission: 'riddle', tone: 'dread' });
    setSlotCard(sc, 'truth', 'truth.sparekey');
    const doorman = card('npc.doorman');
    expect(drawWeight(M, sc, doorman)).toBe(themeWeight(doorman, 'riddle', 'dread') * 4);
    expect(reasonsOf(M, sc, doorman)).toContainEqual({ kind: 'truth' });
    expect(drawWeight(M, sc, card('stage.fishfarm'))).toBe(0);
  });

  it('真相本身：和鎖定的卡合不來 0、合得來 ×2（每張）', () => {
    const sc = newScenario('modern', { mission: 'riddle', tone: 'dread' });
    const t = card('truth.sparekey');
    setSlotCard(sc, 'stage', 'stage.fishfarm');
    sc.slots.stage.locked = true;
    expect(drawWeight(M, sc, t)).toBe(0);
    setSlotCard(sc, 'stage', 'stage.rooftop');
    setSlotCard(sc, 'npc', 'npc.doorman');
    sc.slots.npc.locked = true;
    expect(drawWeight(M, sc, t)).toBe(themeWeight(t, 'riddle', 'dread') * 4);
    expect(reasonsOf(M, sc, t)).toContainEqual({ kind: 'locked' });
  });

  it('大部分的真相至少有一張合不來的卡（D17）', () => {
    for (const deck of [M, F]) {
      const withAvoid = cardsOf(deck, 'truth').filter(
        (c) => Object.keys(c.links?.avoid ?? {}).length,
      );
      expect(withAvoid.length, deck.id).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('抽卡', () => {
  it('同一個種子抽出同樣的整副；不同的種子不同', () => {
    const a = drawn('same');
    const b = drawn('same');
    const c = drawn('other');
    const cards = (sc: Scenario) => STORY_KEYS.map((k) => sc.slots[k].card);
    expect(cards(a)).toEqual(cards(b));
    expect(cards(a)).not.toEqual(cards(c));
    for (const k of STORY_KEYS) expect(a.slots[k].card?.startsWith(`${k}.`)).toBe(true);
  });

  it('餘韻抽到後，真相大多合餘韻（權重 ×18）', () => {
    const rng = seededRandom('core-bias');
    let fit = 0;
    for (let i = 0; i < 300; i++) {
      const sc = newScenario('modern', { mission: 'riddle', tone: 'dread' });
      drawStory(M, sc, rng);
      const core = findCard(M, sc.slots.core.card);
      if (core?.truths?.includes(sc.slots.truth.card ?? '')) fit++;
    }
    expect(fit / 300).toBeGreaterThan(0.8);
  });

  it('鎖定的卡與 PC 的卡在全部重抽時不動；重抽一張一定換一張', () => {
    const sc = drawn('lock');
    drawPcCards(M, sc, seededRandom('pc'));
    sc.slots.stage.locked = true;
    const stage = sc.slots.stage.card;
    const rel = sc.slots.rel1.card;
    const changed = drawStory(M, sc, seededRandom('again'));
    expect(changed).not.toContain('stage');
    expect(sc.slots.stage.card).toBe(stage);
    expect(sc.slots.rel1.card).toBe(rel);
    const rng = seededRandom('reroll');
    for (let i = 0; i < 30; i++) {
      const before = sc.slots.intro.card;
      pickCard(M, sc, 'intro', rng, true);
      expect(sc.slots.intro.card).not.toBe(before);
    }
  });

  it('全部的卡都不合時照樣抽得到（平均抽）；關係與秘密每位 PC 不重複', () => {
    const sc = newScenario('modern', { pcCount: 4 });
    drawPcCards(M, sc, seededRandom('pcs'));
    const rels = pcKeys(sc)
      .filter((k) => k.startsWith('rel'))
      .map((k) => sc.slots[k].card);
    const secs = pcKeys(sc)
      .filter((k) => k.startsWith('sec'))
      .map((k) => sc.slots[k].card);
    expect(new Set(rels).size).toBe(4);
    expect(new Set(secs).size).toBe(4);
    /* 只抽一位 PC：已經有卡的不動 */
    setSlotCard(sc, 'rel2', null);
    const keys = drawPcCards(M, sc, seededRandom('one'), 2);
    expect(keys).toEqual(['rel2']);
  });

  it('真相換了：沒鎖定、和新真相合不來的卡重抽；鎖定的留著', () => {
    const sc = drawn('truth');
    setSlotCard(sc, 'stage', 'stage.fishfarm');
    setSlotCard(sc, 'truth', 'truth.sparekey');
    expect(resolveTruthConflicts(M, sc, seededRandom('x'))).toContain('stage');
    expect(sc.slots.stage.card).not.toBe('stage.fishfarm');
    setSlotCard(sc, 'stage', 'stage.fishfarm');
    sc.slots.stage.locked = true;
    expect(resolveTruthConflicts(M, sc, seededRandom('y'))).not.toContain('stage');
    expect(sc.slots.stage.card).toBe('stage.fishfarm');
  });

  it('餘韻換了：不搭的真相與結局（沒鎖定的）配合餘韻重抽', () => {
    const sc = drawn('core');
    setSlotCard(sc, 'core', 'core.price');
    setSlotCard(sc, 'truth', 'truth.insurance');
    setSlotCard(sc, 'ending', 'ending.sign');
    expect(coreMisfits(M, sc)).toEqual(['truth', 'ending']);
    sc.slots.ending.locked = true;
    expect(coreMisfits(M, sc)).toEqual(['truth']);
    sc.slots.ending.locked = false;
    const changed = refitToCore(M, sc, ['truth', 'ending'], seededRandom('refit'));
    expect(changed).toEqual(expect.arrayContaining(['truth', 'ending']));
    expect(sc.slots.truth.card).not.toBe('truth.insurance');
  });

  it('換題材與氣氛：氣氛變了餘韻與焦點一定換（鎖定的也換）、都不合的換', () => {
    const sc = drawn('mt');
    sc.slots.core.locked = true;
    setSlotCard(sc, 'intro', 'intro.lockedout'); /* riddle、getaway、search；dread、absurd、tense */
    const same = missionToneTargets(M, sc, 'getaway', 'dread');
    expect(same.forced).toEqual([]);
    const t = missionToneTargets(M, sc, 'deal', 'tender');
    expect(t.forced).toEqual(['core', 'tone']);
    expect(t.optional).toContain('intro');
    const changed = applyThemeChange(
      M,
      sc,
      'deal',
      'tender',
      [...t.forced, ...t.optional],
      seededRandom('mt'),
    );
    expect(sc.mission).toBe('deal');
    expect(sc.tone).toBe('tender');
    expect(changed).toEqual(expect.arrayContaining(['core', 'tone', 'intro']));
    expect(findCard(M, sc.slots.core.card)?.tones).toEqual(['tender']);
    expect(findCard(M, sc.slots.tone.card)?.tones).toEqual(['tender']);
    expect(sc.slots.core.locked).toBe(false);
  });

  it('發三張餘韻：同一種氣氛、題材合的排前面、再發時避開剛發過的', () => {
    const sc = newScenario('modern', { mission: 'riddle', tone: 'dread' });
    const deal = offerCores(M, sc, seededRandom('deal'));
    expect(deal).toHaveLength(3);
    for (const id of deal) expect(findCard(M, id)?.tones).toEqual(['dread']);
    /* 陰森裡合解謎的三張（price、heirloom、invited） */
    expect(new Set(deal)).toEqual(new Set(['core.price', 'core.heirloom', 'core.invited']));
    /* 奇幻・尋寶・傳奇：合題材的只有 constellation；剛發過的 respect 排到最後 */
    const fantasy = newScenario('fantasy', { mission: 'treasure', tone: 'legend' });
    fantasy.coreOffer = ['core.respect'];
    const next = offerCores(F, fantasy, seededRandom('again'));
    expect(next).toHaveLength(3);
    expect(next[0]).toBe('core.constellation');
    expect(next).not.toContain('core.respect');
    /* 每種氣氛都有 5 張，再發一次換得到別的 */
    fantasy.coreOffer = next;
    const third = offerCores(F, fantasy, seededRandom('third'));
    expect(third.filter((id) => !next.includes(id)).length).toBeGreaterThanOrEqual(1);
  });
});

describe('回答與提問', () => {
  it('回答跟著卡：換卡就清掉；換真相時其他沒鎖定的回答也算進會清掉的', () => {
    const sc = drawn('answers');
    writeReply(sc, 'intro', '在頂樓');
    writeReply(sc, 'stage', '舞台的回答');
    writeReply(sc, 'truth', '真相的回答');
    expect(replyOf(sc, 'intro')).toBe('在頂樓');
    expect(answersAtRisk(sc, ['intro'])).toEqual(['intro']);
    sc.slots.stage.locked = true;
    expect(new Set(answersAtRisk(sc, ['truth']))).toEqual(new Set(['truth', 'intro']));
    const before = sc.slots.intro.card;
    pickCard(M, sc, 'intro', seededRandom('a'), true);
    expect(sc.slots.intro.card).not.toBe(before);
    expect(replyOf(sc, 'intro')).toBe('');
    writeReply(sc, 'stage', '   ');
    expect(replyOf(sc, 'stage')).toBe('');
  });

  it('改寫提問；和原本一樣或空白＝還原', () => {
    const sc = drawn('q');
    const original = promptOf(M, sc, 'clue');
    writePrompt(M, sc, 'clue', '改寫的提問？');
    expect(promptOf(M, sc, 'clue')).toBe('改寫的提問？');
    writePrompt(M, sc, 'clue', original);
    expect(sc.questions.clue).toBeUndefined();
    writePrompt(M, sc, 'clue', '再改');
    writePrompt(M, sc, 'clue', '  ');
    expect(promptOf(M, sc, 'clue')).toBe(original);
  });

  it('給個例子：從這張卡的回答例子挑，和現在的不同', () => {
    const sc = drawn('rand');
    const c = findCard(M, sc.slots.npc.card);
    const rng = seededRandom('r');
    for (let i = 0; i < 10; i++) {
      const a = pickExampleReply(M, sc, 'npc', rng);
      expect(c?.answers).toContain(a);
      expect(a).not.toBe(replyOf(sc, 'npc'));
      writeReply(sc, 'npc', a);
    }
    /* 餘韻的回答例子＝最後一幕的例子 */
    expect(findCard(M, sc.slots.core.card)?.answers).toContain(
      pickExampleReply(M, sc, 'core', rng),
    );
  });
});

describe('角色', () => {
  it('牽扯的對象：預設 PC1 → PC2 → … → PC1；一個 PC 時是 NPC；選的不在了回到預設', () => {
    const sc = drawn('cast', { pcCount: 3 });
    expect([1, 2, 3].map((i) => bondTargetOf(M, sc, i))).toEqual(['pc2', 'pc3', 'pc1']);
    sc.pcs[0].target = 'npc';
    expect(bondTargetOf(M, sc, 1)).toBe('npc');
    sc.pcs[0].target = 'pc1';
    expect(bondTargetOf(M, sc, 1)).toBe('pc2');
    sc.pcs[0].target = 'x-gone';
    expect(bondTargetOf(M, sc, 1)).toBe('pc2');
    sc.extras.push({ id: 'x-1', name: '', role: '', tie: '' });
    sc.pcs[0].target = 'x-1';
    expect(bondTargetOf(M, sc, 1)).toBe('x-1');
    expect(bondTargetName(M, sc, 'x-1')).toBe('配角 1');
    sc.pcCount = 1;
    sc.pcs[0].target = null;
    expect(bondTargetOf(M, sc, 1)).toBe('npc');
  });

  it('NPC 的選項與名稱、「PC1 → PC2」', () => {
    const sc = drawn('npc');
    const npcTitle = findCard(M, sc.slots.npc.card)?.title;
    expect(npcChoices(M, sc)).toEqual([{ id: 'npc', label: npcTitle }]);
    sc.npc.name = '沈靜如';
    sc.pcs[1].name = '阿哲';
    expect(npcChoices(M, sc)[0].label).toBe('沈靜如');
    drawPcCards(M, sc, seededRandom('w'));
    expect(slotWho(M, sc, 'rel1')).toBe('PC1 → PC2（阿哲）');
    expect(slotWho(M, sc, 'sec2')).toBe('PC2');
    sc.useSecrets = false;
    expect(pcKeys(sc)).toEqual(['rel1', 'rel2']);
  });
});

describe('推理與場景', () => {
  function plotOf() {
    return {
      deductions: [
        { id: 'n1', text: '兇手是誰' },
        { id: 'n2', text: '' },
      ],
      scenes: [
        { id: 's1', name: '開場', place: '', what: '' },
        { id: 's2', name: '現場', place: '公寓', what: '' },
      ],
      clues: [
        { id: 'c3', text: '鞋印', how: '偵查', scene: 's2', links: ['n1'] },
        { id: 'c1', text: '收據', how: '', scene: 's1', links: ['n1'] },
        { id: 'c2', text: '合照', how: '', scene: 's2', links: ['n1', 'n2'] },
        { id: 'c4', text: '傳言', how: '', scene: '', links: [] },
        { id: 'c5', text: '', how: '', scene: 's1', links: ['n2'] },
      ],
    };
  }

  it('標號：推理題 A、B，場景 #1、#2，線索是「場景－第幾條」、還沒放的是 ?-1', () => {
    const p = plotOf();
    const no = plotLabels(p);
    expect([no.n1, no.n2, no.s1, no.s2]).toEqual(['A', 'B', '#1', '#2']);
    expect([no.c1, no.c5, no.c3, no.c2, no.c4]).toEqual(['1-1', '1-2', '2-1', '2-2', '?-1']);
    expect(cluesFor(p, 'n1').map((c) => no[c.id])).toEqual(['1-1', '2-1', '2-2']);
    /* 沒寫內容的線索不算 */
    expect(cluesFor(p, 'n2').map((c) => no[c.id])).toEqual(['2-2']);
  });

  it('健檢：先列總數；3 條以上 ok、2 條 mid、1 條以下 warn；沒有線索的場景、還沒放的線索、沒指向推理題的線索', () => {
    const p = plotOf();
    const items = reviewPlot(p);
    expect(items[0]).toEqual({ level: 'info', text: '推理題 2 道、場景 2 個、線索 4 條。' });
    expect(items.find((x) => x.deduction === 'n1')?.level).toBe('ok');
    expect(items.find((x) => x.deduction === 'n1')?.text).toBe('A. 兇手是誰　3 條線索，夠了');
    expect(items.find((x) => x.deduction === 'n2')?.level).toBe('warn');
    expect(items.find((x) => x.deduction === 'n2')?.text).toContain('B. （空白）　只有 1 條線索');
    expect(items).toContainEqual({ level: 'warn', text: '?-1 還沒放進任何場景。' });
    expect(
      items.some((x) => x.level === 'mid' && x.text.startsWith('?-1 沒有指向任何推理題')),
    ).toBe(true);
    p.clues[0].links = [];
    expect(reviewPlot(p).find((x) => x.deduction === 'n1')?.level).toBe('mid');
    expect(reviewPlot(blankPlot()).find((x) => x.text.includes('裡沒有線索'))?.text).toContain(
      '#1',
    );
    expect(reviewPlot({ deductions: [], scenes: [], clues: [] })[1].level).toBe('warn');
  });

  it('刪除：推理題拿掉線索的指向、場景的線索移到「還沒放」；確認的條件；場景上下移', () => {
    const p = plotOf();
    expect(needsDeleteConfirm(p, 'deduction', 'n1')).toBe(true);
    expect(needsDeleteConfirm(p, 'deduction', 'n2')).toBe(false);
    expect(needsDeleteConfirm(p, 'scene', 's1')).toBe(true);
    expect(needsDeleteConfirm(p, 'clue', 'c5')).toBe(false);
    removePlotItem(p, 'deduction', 'n1');
    expect(p.clues.find((c) => c.id === 'c2')?.links).toEqual(['n2']);
    removePlotItem(p, 'scene', 's2');
    expect(p.clues.filter((c) => c.scene === '').map((c) => c.id)).toEqual(['c3', 'c2', 'c4']);
    p.scenes.push({ id: 's3', name: '', place: '', what: '' });
    expect(moveScene(p, 's3', -1)).toBe(true);
    expect(p.scenes.map((s) => s.id)).toEqual(['s3', 's1']);
    expect(moveScene(p, 's3', -1)).toBe(false);
  });

  it('用卡片排草稿：推理題 3 道、場景 5 個（開場～揭曉與收尾）、線索 3 條各指向不同的推理題', () => {
    const sc = drawn('seed');
    sc.npc.name = '沈靜如';
    writeReply(sc, 'clue', '委託人自己');
    const p = draftPlot(M, sc);
    expect(p.deductions).toHaveLength(3);
    expect(p.deductions[1].text).toBe('沈靜如隱瞞了什麼？');
    expect(p.scenes.map((s) => s.name.split('：')[0])).toEqual([
      '開場',
      '現場',
      '對話',
      '阻礙',
      '揭曉與收尾',
    ]);
    expect(p.clues).toHaveLength(3);
    expect(p.clues[0].text).toBe(`${findCard(M, sc.slots.clue.card)?.title}——委託人自己`);
    expect(p.clues.map((c) => c.scene)).toEqual([p.scenes[1].id, p.scenes[2].id, p.scenes[3].id]);
    expect(p.clues.map((c) => c.links)).toEqual(p.deductions.map((d) => [d.id]));
    expect(p.clues[1].text).toBe('沈靜如說溜嘴的一句話');
    expect(p.clues[2].text).toBe(`「${findCard(M, sc.slots.tone.card)?.title}」留下的痕跡`);
    expect(plotTextLines(p)[0]).toBe('推理題');
  });
});

describe('專案檔與自動存檔', () => {
  it('往返：存的資料讀回來一模一樣', () => {
    const sc = drawn('rt', { pcCount: 3 });
    drawPcCards(M, sc, seededRandom('p'));
    writeReply(sc, 'truth', '真相\n第二行');
    writePrompt(M, sc, 'npc', '改寫的提問');
    sc.title = '我的劇本';
    sc.extras.push({ id: 'x-1', name: '阿明', role: '弟弟', tie: '' });
    sc.plot = draftPlot(M, sc);
    const data = JSON.parse(JSON.stringify({ scenario: sc }));
    expect(scenarioFromProject(data, PROJECT_VERSION)).toEqual(sc);
  });

  it('較新的版本、不是劇本：丟出可以顯示的錯誤', () => {
    const sc = drawn('v');
    expect(() => scenarioFromProject({ scenario: sc }, PROJECT_VERSION + 1)).toThrow(
      ProjectFileError,
    );
    expect(() => scenarioFromProject({ scenario: sc }, PROJECT_VERSION + 1)).toThrow(
      /比較新的版本/,
    );
    expect(() => scenarioFromProject({}, 1)).toThrow(/沒有劇本/);
    expect(() => scenarioFromProject({ scenario: { deck: 'scifi' } }, 1)).toThrow(ProjectFileError);
  });

  it('壞掉的欄位：不認得的卡丟掉、別的卡的回答丟掉、PC 人數夾在 1～4、沒有卡的「抽好了」回到開始', () => {
    const sc = sanitizeScenario({
      deck: 'fantasy',
      mission: 'nope',
      tone: 'bleak',
      pcCount: 9,
      phase: 'done',
      step: 'weird',
      slots: {
        core: { card: 'core.respect', locked: true },
        intro: { card: 'intro.nope' },
        npc: { card: 'clue.pigeon' },
      },
      answers: {
        core: { card: 'core.respect', text: '放下劍' },
        intro: { card: 'intro.lostbet', text: '不在欄上' },
        bogus: { card: 'core.respect', text: 'x' },
      },
      pcs: [{ name: 1, role: '騎士', target: 'pc2' }, null],
      plot: {
        deductions: [{ id: 'n1', text: '推理' }, { text: '沒有 id' }],
        scenes: [{ id: 's1', name: '場景' }],
        clues: [{ id: 'c1', text: '線索', scene: 'gone', links: ['n1', 'n9', 'n1'] }],
      },
    });
    expect(sc).not.toBeNull();
    if (!sc) return;
    expect(sc.mission).toBeNull();
    expect(sc.tone).toBe('bleak');
    expect(sc.pcCount).toBe(4);
    expect(sc.slots.core).toEqual({ card: 'core.respect', locked: true });
    expect(sc.slots.intro.card).toBeNull();
    expect(sc.slots.npc.card).toBeNull();
    expect(Object.keys(sc.answers)).toEqual(['core']);
    expect(sc.pcs[0]).toEqual({ name: '', role: '騎士', target: 'pc2' });
    expect(sc.pcs).toHaveLength(4);
    expect(sc.step).toBe('cards');
    expect(sc.phase).toBe('done');
    expect(sc.plot.deductions).toEqual([{ id: 'n1', text: '推理' }]);
    expect(sc.plot.clues[0]).toMatchObject({ scene: '', links: ['n1'] });
    expect(sanitizeScenario({ deck: 'modern', phase: 'done' })?.phase).toBe('start');
    expect(sanitizeScenario('壞掉')).toBeNull();
  });

  it('自動存檔整份：重複的 id 只留一份、目前的劇本不在清單裡時 null', () => {
    const a = drawn('a');
    const s = sanitizeState({ scenarios: [a, a, { deck: 'x' }, 3], current: 'missing' });
    expect(s.scenarios).toHaveLength(1);
    expect(s.current).toBeNull();
    expect(sanitizeState(null)).toEqual({ scenarios: [], current: null });
    expect(sanitizeState({ scenarios: [a], current: a.id }).current).toBe(a.id);
  });
});

describe('匯出的文字', () => {
  it('故事梗概：卡齊了才有；五段的順序；真相的 {tone} 第一次寫焦點名與卡名、之後只寫卡名', () => {
    expect(briefOf(M, newScenario('modern'))).toBeNull();
    expect(fillTone('A{tone}B{tone}C{stage}', '越長越高的影子', '怪談', '舞台')).toBe(
      'A怪談「越長越高的影子」B「越長越高的影子」C舞台',
    );
    const sc = drawn('syn');
    const brief = briefOf(M, sc);
    expect(brief?.map((p) => p.label)).toEqual([
      '開場',
      '往前走',
      '幕後（只給 GM）',
      '收尾',
      '留給 GM 的空格',
    ]);
    const stage = findCard(M, sc.slots.stage.card)?.title ?? '';
    const intro = findCard(M, sc.slots.intro.card)?.title ?? '';
    const tone = findCard(M, sc.slots.tone.card)?.title ?? '';
    expect(brief?.[0].lines).toEqual([
      `「${intro}」把 PC 們帶到了「${stage}」。`,
      `而這附近流傳著一則怪談：「${tone}」。`,
    ]);
    const back = brief?.[2].lines[0] ?? '';
    expect(back).toContain(`「${stage}」`);
    expect(back).toContain(`怪談「${tone}」`);
    expect(back).not.toMatch(/\{(tone|stage)\}/);
    expect(brief?.[4].lines).toHaveLength(3);
  });

  it('純文字檔：劇本名、題材與氣氛、故事梗概、角色、推理題與場景表、每張卡的提問與回答', () => {
    const sc = drawn('txt');
    drawPcCards(M, sc, seededRandom('t'));
    writeReply(sc, 'core', '第一行\n第二行');
    sc.plot = draftPlot(M, sc);
    const text = scenarioText(M, sc);
    const lines = text.split('\n');
    expect(lines[0]).toBe(fallbackTitle(M, sc));
    expect(lines[0]).toContain('：');
    expect(lines[2]).toBe('解謎・陰森');
    expect(text).toContain('＝＝ 故事梗概 ＝＝\n〔開場〕');
    expect(text).toContain('＝＝ 角色 ＝＝\n● PC1\n　牽扯：PC2');
    expect(text).toContain('＝＝ 推理題與場景表 ＝＝\n推理題\nA. ');
    expect(text).toContain(`[餘韻] ${findCard(M, sc.slots.core.card)?.title}`);
    expect(text).toContain('　回答　第一行\n　　　　第二行');
    expect(text).toContain('[關係／PC1 → PC2] ');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('文件的 HTML：使用者的字一律跳脫；章節與 PC；只用 pdk- 開頭的 class', () => {
    const sc = drawn('html');
    drawPcCards(M, sc, seededRandom('h'));
    sc.title = '<script>alert(1)</script>';
    writeReply(sc, 'stage', 'a & b <b>');
    const html = documentHtml(M, sc, new Date(2026, 10, 15));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b &lt;b&gt;');
    expect(html).toContain('2026-11-15');
    expect(html.match(/data-doc-section=/g)).toHaveLength(5);
    expect(html.match(/data-doc-pc=/g)).toHaveLength(2);
    const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(' '));
    expect(classes.filter((c) => !c.startsWith('pdk-') && !c.startsWith('is-'))).toEqual([]);
    sc.plot = draftPlot(M, sc);
    expect(documentHtml(M, sc).match(/data-doc-section=/g)).toHaveLength(6);
  });

  it('送去劇本排版台：劇本排版台照 markdown 讀得出標題、章節、手冊（秘密）、NPC 卡與線索表', () => {
    const sc = drawn('md');
    drawPcCards(M, sc, seededRandom('m'));
    sc.title = '霧裡的廟口';
    sc.npc.name = '沈靜如';
    sc.plot = draftPlot(M, sc);
    const md = editorMarkdown(M, sc);
    const { blocks, marked } = mdParse(md, { skip: [], ho: new Set(), tpls: [] });
    expect(marked).toBe(true);
    const types = blocks.map((b) => b.type);
    expect(types[0]).toBe('title');
    expect(blocks[0].text).toBe('霧裡的廟口');
    expect(types).toContain('subtitle');
    expect(blocks.filter((b) => b.type === 'h1').map((b) => b.text)).toEqual([
      '故事梗概',
      '餘韻與收尾',
      '開場與阻礙',
      '幕後與線頭',
      '推理題與場景表',
      '角色',
    ]);
    const handouts = blocks.filter((b) => b.type === 'handout');
    expect(handouts).toHaveLength(2);
    expect(handouts[0].text).toContain('秘密「');
    const npc = blocks.find((b) => b.type === 'npc');
    expect(npc?.npc?.name).toBe('沈靜如');
    const tables = blocks.filter((b) => b.type === 'table');
    expect(tables.length).toBeGreaterThan(0);
    const tbl = tables[0].tbl;
    expect(tbl && cellsRead(tbl)[0]).toEqual(['#', '線索', '怎麼拿到', '指向']);
    expect(tbl && cellsRead(tbl)[1][0]).toBe('2-1');
    expect(blocks.filter((b) => b.type === 'note').length).toBeGreaterThanOrEqual(9);
    /* 自己的段落都是描述文（梗概的「「…」把 PC 們帶到了…」不會變成台詞） */
    expect(types.filter((t) => ['dialog', 'proc', 'scene', 'hr', 'image'].includes(t))).toEqual([]);
  });

  it('送去劇本排版台：使用者寫的 markdown 行首、引號開頭、檢定的寫法照樣是文字（L2）', () => {
    const sc = drawn('md-escape');
    drawPcCards(M, sc, seededRandom('e'));
    sc.title = ':::';
    writeReply(sc, 'stage', '# 不是標題\n\n---\n:::note\n![圖](x.png)\n```\n::: ');
    writeReply(sc, 'intro', '「開頭就是引號」');
    writeReply(sc, 'npc', '〈觀察〉判定成功的話會發現');
    writeReply(sc, 'truth', '※ 不是注釋');
    writeReply(sc, 'ending', '> 不是引用\n| a | b |\n- 不是清單\n1. 也不是');
    writePrompt(M, sc, 'clue', ':::\n:::note[假的]');
    sc.npc.tie = ':::\n# 也不是標題';
    sc.pcs[0].role = '::: 騎士';
    sc.plot = draftPlot(M, sc);
    sc.plot.scenes[0].what = '（場景）不是場景\n「也不是台詞」';
    sc.plot.deductions[0].text = '【判定】也不是特殊區塊';
    const md = editorMarkdown(M, sc);
    const { blocks } = mdParse(md, { skip: [], ho: new Set(), tpls: [] });
    const types = blocks.map((b) => b.type);
    expect(types.filter((t) => ['dialog', 'proc', 'scene', 'hr', 'image'].includes(t))).toEqual([]);
    const text = (b: (typeof blocks)[number]) => String(b.text ?? '').replace(/​/g, '');
    expect(blocks[0].type).toBe('title');
    expect(text(blocks[0])).toBe(':::');
    expect(blocks.filter((b) => b.type === 'h1')).toHaveLength(6);
    expect(blocks.some((b) => /^h[1-3]$/.test(b.type) && text(b).includes('不是標題'))).toBe(false);
    const descs = blocks.filter((b) => b.type === 'desc').map(text);
    expect(descs.some((t) => t.includes('# 不是標題') && t.includes('---'))).toBe(true);
    expect(descs.some((t) => t.includes('「開頭就是引號」'))).toBe(true);
    expect(descs.some((t) => t.includes('〈觀察〉判定成功的話會發現'))).toBe(true);
    expect(descs.some((t) => t.includes('※ 不是注釋'))).toBe(true);
    expect(descs.some((t) => t.includes('（場景）不是場景'))).toBe(true);
    expect(descs.some((t) => t.includes('【判定】也不是特殊區塊'))).toBe(true);
    /* 劇本排版台不認得 >、表格（:::table 以外）、清單的寫法，照原樣是文字 */
    expect(descs.some((t) => t.includes('> 不是引用\n| a | b |\n- 不是清單\n1. 也不是'))).toBe(
      true,
    );
    expect(blocks.filter((b) => b.type === 'table')).toHaveLength(
      (md.match(/^:::table\[/gm) ?? []).length,
    );
    /* 圍起來的寫法沒有被使用者的 ::: 提早關掉：手冊、NPC 卡的數量照舊，內容還在 */
    const handouts = blocks.filter((b) => b.type === 'handout');
    expect(handouts).toHaveLength(2);
    expect(text(handouts[0])).toContain('::: 騎士');
    expect(blocks.filter((b) => b.type === 'npc')).toHaveLength(1);
    expect(blocks.some((b) => b.type === 'note' && text(b).includes(':::note[假的]'))).toBe(true);
  });

  it('卡片的數量：每一類各一欄，PC 的卡另外', () => {
    expect(STORY_KEYS).toHaveLength(9);
    expect(cardsOf(M, 'relation').length).toBeGreaterThanOrEqual(4);
  });
});
