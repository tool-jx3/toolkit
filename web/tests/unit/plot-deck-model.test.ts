/**
 * 劇本骨架抽卡（plot-deck）的邏輯：抽卡的偏好（權重）與種子、鎖定與重抽、從清單挑、真相與核心的連動、
 * 題材與氣氛的變更、發三張核心、PC 的關係與秘密、推理與線索的檢查、專案檔往返與舊版／壞檔、匯出的文字。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import { ProjectFileError } from '@/core/storage';
import { cardsOf, DECKS, findCard } from '@/tools/plot-deck/data';
import {
  documentHtml,
  editorMarkdown,
  fillTone,
  outlineText,
  synopsis,
} from '@/tools/plot-deck/model/document';
import {
  answersAtRisk,
  applyMissionTone,
  coreMisfits,
  dealCores,
  drawAll,
  drawPcCards,
  fitOf,
  fixAfterTruth,
  missionToneTargets,
  pickCard,
  randomAnswer,
  reasonsOf,
  refitToCore,
  tagWeight,
  weightOf,
} from '@/tools/plot-deck/model/draw';
import {
  blankPlot,
  checkPlot,
  cluesFor,
  moveScene,
  needsDeleteConfirm,
  plotLines,
  plotNumbers,
  removePlotItem,
  seedPlot,
} from '@/tools/plot-deck/model/plot';
import {
  PROJECT_VERSION,
  sanitizeScenario,
  sanitizeState,
  scenarioFromProject,
} from '@/tools/plot-deck/model/project';
import {
  answerOf,
  autoTitle,
  newScenario,
  npcList,
  pcKeys,
  questionOf,
  relTarget,
  type Scenario,
  STORY_KEYS,
  setAnswer,
  setQuestion,
  setSlotCard,
  slotWho,
  targetLabel,
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
  const sc = newScenario('modern', { mission: 'inv', tone: 'horror', ...options });
  sc.phase = 'done';
  drawAll(M, sc, seededRandom(seed));
  return sc;
}

describe('權重（題材與氣氛）', () => {
  it('fitOf：還沒決定 null、全部 2、合 1、不合 0', () => {
    expect(fitOf(['inv'], null)).toBeNull();
    expect(fitOf(undefined, 'inv')).toBe(2);
    expect(fitOf(['*'], 'inv')).toBe(2);
    expect(fitOf(['inv', 'chase'], 'chase')).toBe(1);
    expect(fitOf(['inv'], 'chase')).toBe(0);
  });

  it('體驗的核心：氣氛不同 0、題材合 6、其他 1', () => {
    const c = card('core.curious'); /* horror；inv、expose、survive */
    expect(tagWeight(c, 'inv', 'suspense')).toBe(0);
    expect(tagWeight(c, 'inv', 'horror')).toBe(6);
    expect(tagWeight(c, 'crime', 'horror')).toBe(1);
    expect(tagWeight(c, null, null)).toBe(1);
  });

  it('氣氛卡：氣氛不同 0、題材合 3、其他 1', () => {
    const c = card('tone.stairs'); /* horror；inv、survive、rescue */
    expect(tagWeight(c, 'inv', 'youth')).toBe(0);
    expect(tagWeight(c, 'inv', 'horror')).toBe(3);
    expect(tagWeight(c, 'crime', 'horror')).toBe(1);
  });

  it('其他：都不合 0.05、合 ×6、全部 ×2、還沒決定 ×1', () => {
    const intro = card('intro.parttime'); /* inv、inf、survive；horror、daily、comedy */
    expect(tagWeight(intro, 'crime', 'noir')).toBe(0.05);
    expect(tagWeight(intro, 'inv', 'horror')).toBe(36);
    expect(tagWeight(intro, 'inv', null)).toBe(6);
    expect(tagWeight(intro, 'crime', 'horror')).toBe(6);
    const cctv = card('clue.cctv'); /* 氣氛 * */
    expect(tagWeight(cctv, 'inv', 'horror')).toBe(12);
    expect(tagWeight(cctv, 'expose', 'horror')).toBe(2);
    expect(tagWeight(card('relation.owe'), 'inv', 'horror')).toBe(1);
  });
});

describe('權重（核心、舞台、真相的相性）', () => {
  it('合體驗的核心的真相與結局 ×18；理由「符合體驗的核心」', () => {
    const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
    setSlotCard(sc, 'core', 'core.curious');
    const fit = card('truth.experiment');
    const other = card('truth.insurance');
    expect(weightOf(M, sc, fit)).toBe(tagWeight(fit, 'inv', 'horror') * 18);
    expect(weightOf(M, sc, other)).toBe(tagWeight(other, 'inv', 'horror'));
    expect(reasonsOf(M, sc, fit)).toContainEqual({ kind: 'core' });
    expect(weightOf(M, sc, card('ending.erase'))).toBe(
      tagWeight(card('ending.erase'), 'inv', 'horror') * 18,
    );
  });

  it('舞台的種類都不合 ×0.06', () => {
    const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
    setSlotCard(sc, 'stage', 'stage.onsen'); /* remote、closed */
    const cordon = card('obstacle.cordon'); /* city、crowd */
    const signal = card('obstacle.signal'); /* remote、closed */
    expect(weightOf(M, sc, cordon)).toBeCloseTo(tagWeight(cordon, 'inv', 'horror') * 0.06);
    expect(weightOf(M, sc, signal)).toBe(tagWeight(signal, 'inv', 'horror'));
  });

  it('真相抽到後：合得來 ×4、合不來 0（理由「和真相合得來」）', () => {
    const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
    setSlotCard(sc, 'truth', 'truth.experiment');
    const rec = card('clue.recording');
    expect(weightOf(M, sc, rec)).toBe(tagWeight(rec, 'inv', 'horror') * 4);
    expect(reasonsOf(M, sc, rec)).toContainEqual({ kind: 'truth' });
    expect(weightOf(M, sc, card('npc.collector'))).toBe(0);
  });

  it('真相本身：和鎖定的卡合不來 0、合得來 ×2（每張）', () => {
    const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
    setSlotCard(sc, 'npc', 'npc.collector');
    sc.slots.npc.locked = true;
    expect(weightOf(M, sc, card('truth.experiment'))).toBe(0);
    setSlotCard(sc, 'npc', 'npc.salesman');
    setSlotCard(sc, 'clue', 'clue.cctv');
    sc.slots.clue.locked = true;
    const t = card('truth.double');
    expect(weightOf(M, sc, t)).toBe(tagWeight(t, 'inv', 'horror') * 4);
    expect(reasonsOf(M, sc, t)).toContainEqual({ kind: 'locked' });
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

  it('體驗的核心抽到後，真相大多合核心（權重 ×18）', () => {
    const rng = seededRandom('core-bias');
    let fit = 0;
    for (let i = 0; i < 300; i++) {
      const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
      drawAll(M, sc, rng);
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
    const changed = drawAll(M, sc, seededRandom('again'));
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
    sc.pcCount = 4;
    setSlotCard(sc, 'rel2', null);
    const keys = drawPcCards(M, sc, seededRandom('one'), 2);
    expect(keys).toEqual(['rel2']);
  });

  it('真相換了：沒鎖定、和新真相合不來的卡重抽；鎖定的留著', () => {
    const sc = drawn('truth');
    setSlotCard(sc, 'npc', 'npc.collector');
    setSlotCard(sc, 'truth', 'truth.experiment');
    expect(fixAfterTruth(M, sc, seededRandom('x'))).toContain('npc');
    expect(sc.slots.npc.card).not.toBe('npc.collector');
    setSlotCard(sc, 'npc', 'npc.collector');
    sc.slots.npc.locked = true;
    expect(fixAfterTruth(M, sc, seededRandom('y'))).not.toContain('npc');
    expect(sc.slots.npc.card).toBe('npc.collector');
  });

  it('體驗的核心換了：合不來的真相與結局（沒鎖定的）配合核心重抽', () => {
    const sc = drawn('core');
    setSlotCard(sc, 'core', 'core.curious');
    setSlotCard(sc, 'truth', 'truth.insurance');
    setSlotCard(sc, 'ending', 'ending.happy');
    expect(coreMisfits(M, sc)).toEqual(['truth', 'ending']);
    sc.slots.ending.locked = true;
    expect(coreMisfits(M, sc)).toEqual(['truth']);
    sc.slots.ending.locked = false;
    const changed = refitToCore(M, sc, ['truth', 'ending'], seededRandom('refit'));
    expect(changed).toEqual(expect.arrayContaining(['truth', 'ending']));
    expect(sc.slots.truth.card).not.toBe('truth.insurance');
  });

  it('換題材與氣氛：氣氛變了核心與氣氛卡一定換（鎖定的也換）、都不合的換', () => {
    const sc = drawn('mt');
    sc.slots.core.locked = true;
    setSlotCard(sc, 'intro', 'intro.parttime'); /* inv；horror */
    const same = missionToneTargets(M, sc, 'chase', 'horror');
    expect(same.must).toEqual([]);
    const t = missionToneTargets(M, sc, 'crime', 'noir');
    expect(t.must).toEqual(['core', 'tone']);
    expect(t.optional).toContain('intro');
    const changed = applyMissionTone(
      M,
      sc,
      'crime',
      'noir',
      [...t.must, ...t.optional],
      seededRandom('mt'),
    );
    expect(sc.mission).toBe('crime');
    expect(sc.tone).toBe('noir');
    expect(changed).toEqual(expect.arrayContaining(['core', 'tone', 'intro']));
    expect(findCard(M, sc.slots.core.card)?.tones).toEqual(['noir']);
    expect(findCard(M, sc.slots.tone.card)?.tones).toEqual(['noir']);
    expect(sc.slots.core.locked).toBe(false);
  });

  it('發三張核心：同一種氣氛、題材合的排前面、換三張時避開剛發過的', () => {
    const sc = newScenario('modern', { mission: 'inv', tone: 'horror' });
    const deal = dealCores(M, sc, seededRandom('deal'));
    expect(deal).toHaveLength(3);
    for (const id of deal) expect(findCard(M, id)?.tones).toEqual(['horror']);
    /* inv 合的兩張（curious、curse）在前 */
    expect(new Set(deal.slice(0, 2))).toEqual(new Set(['core.curious', 'core.curse']));
    /* 題材 explore：三張都合；剛發過的 encounter 排到最後 */
    const fantasy = newScenario('fantasy', { mission: 'explore', tone: 'fairy' });
    fantasy.coreDeal = ['core.encounter'];
    const next = dealCores(F, fantasy, seededRandom('again'));
    expect(next).toHaveLength(3);
    expect(next.indexOf('core.encounter')).toBe(2);
  });
});

describe('回答與問題', () => {
  it('回答跟著卡：換卡就清掉；換真相時其他沒鎖定的回答也算進會清掉的', () => {
    const sc = drawn('answers');
    setAnswer(sc, 'intro', '在便利商店');
    setAnswer(sc, 'stage', '舞台的回答');
    setAnswer(sc, 'truth', '真相的回答');
    expect(answerOf(sc, 'intro')).toBe('在便利商店');
    expect(answersAtRisk(sc, ['intro'])).toEqual(['intro']);
    sc.slots.stage.locked = true;
    expect(new Set(answersAtRisk(sc, ['truth']))).toEqual(new Set(['truth', 'intro']));
    const before = sc.slots.intro.card;
    pickCard(M, sc, 'intro', seededRandom('a'), true);
    expect(sc.slots.intro.card).not.toBe(before);
    expect(answerOf(sc, 'intro')).toBe('');
    setAnswer(sc, 'stage', '   ');
    expect(answerOf(sc, 'stage')).toBe('');
  });

  it('改寫問題；和原本一樣或空白＝還原', () => {
    const sc = drawn('q');
    const original = questionOf(M, sc, 'clue');
    setQuestion(M, sc, 'clue', '改寫的問題？');
    expect(questionOf(M, sc, 'clue')).toBe('改寫的問題？');
    setQuestion(M, sc, 'clue', original);
    expect(sc.questions.clue).toBeUndefined();
    setQuestion(M, sc, 'clue', '再改');
    setQuestion(M, sc, 'clue', '  ');
    expect(questionOf(M, sc, 'clue')).toBe(original);
  });

  it('隨機回答：從這張卡的回答例子挑，和現在的不同', () => {
    const sc = drawn('rand');
    const c = findCard(M, sc.slots.npc.card);
    const rng = seededRandom('r');
    for (let i = 0; i < 10; i++) {
      const a = randomAnswer(M, sc, 'npc', rng);
      expect(c?.answers).toContain(a);
      expect(a).not.toBe(answerOf(sc, 'npc'));
      setAnswer(sc, 'npc', a);
    }
    /* 體驗的核心的回答例子＝高潮的例子 */
    expect(findCard(M, sc.slots.core.card)?.answers).toContain(randomAnswer(M, sc, 'core', rng));
  });
});

describe('PC 與 NPC', () => {
  it('關係的對象：預設 PC1 → PC2 → … → PC1；一個 PC 時是 NPC；選的不在了回到預設', () => {
    const sc = drawn('cast', { pcCount: 3 });
    expect([1, 2, 3].map((i) => relTarget(M, sc, i))).toEqual(['pc2', 'pc3', 'pc1']);
    sc.pcs[0].target = 'npc';
    expect(relTarget(M, sc, 1)).toBe('npc');
    sc.pcs[0].target = 'pc1';
    expect(relTarget(M, sc, 1)).toBe('pc2');
    sc.pcs[0].target = 'x-gone';
    expect(relTarget(M, sc, 1)).toBe('pc2');
    sc.extras.push({ id: 'x-1', name: '', role: '', tie: '' });
    sc.pcs[0].target = 'x-1';
    expect(relTarget(M, sc, 1)).toBe('x-1');
    expect(targetLabel(M, sc, 'x-1')).toBe('追加的 NPC 1');
    sc.pcCount = 1;
    sc.pcs[0].target = null;
    expect(relTarget(M, sc, 1)).toBe('npc');
  });

  it('NPC 清單與名稱、「PC1 → PC2」', () => {
    const sc = drawn('npc');
    const npcTitle = findCard(M, sc.slots.npc.card)?.title;
    expect(npcList(M, sc)).toEqual([{ id: 'npc', label: npcTitle }]);
    sc.npc.name = '沈靜如';
    sc.pcs[1].name = '阿哲';
    expect(npcList(M, sc)[0].label).toBe('沈靜如');
    drawPcCards(M, sc, seededRandom('w'));
    expect(slotWho(M, sc, 'rel1')).toBe('PC1 → PC2（阿哲）');
    expect(slotWho(M, sc, 'sec2')).toBe('PC2');
    sc.useSecrets = false;
    expect(pcKeys(sc)).toEqual(['rel1', 'rel2']);
  });
});

describe('場景與線索', () => {
  function plotOf() {
    return {
      deductions: [
        { id: 'n1', text: '兇手是誰' },
        { id: 'n2', text: '' },
      ],
      scenes: [
        { id: 's1', name: '導入', place: '', what: '' },
        { id: 's2', name: '調查', place: '公寓', what: '' },
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

  it('編號：線索依場景的順序，沒決定場景的排最後', () => {
    const p = plotOf();
    const no = plotNumbers(p);
    expect([no.n1, no.n2, no.s1, no.s2]).toEqual(['N1', 'N2', 'S1', 'S2']);
    expect([no.c1, no.c5, no.c3, no.c2, no.c4]).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    expect(cluesFor(p, 'n1').map((c) => no[c.id])).toEqual(['C1', 'C3', 'C4']);
    /* 沒寫內容的線索不算 */
    expect(cluesFor(p, 'n2').map((c) => no[c.id])).toEqual(['C4']);
  });

  it('檢查：3 條以上 ok、2 條 mid、1 條以下 warn；沒場景、沒連推理、沒線索的場景', () => {
    const p = plotOf();
    const items = checkPlot(p);
    expect(items.find((x) => x.deduction === 'n1')?.level).toBe('ok');
    expect(items.find((x) => x.deduction === 'n1')?.text).toBe('N1 兇手是誰：線索 3 條');
    expect(items.find((x) => x.deduction === 'n2')?.level).toBe('warn');
    expect(items.find((x) => x.deduction === 'n2')?.text).toContain('N2 （還沒寫）：線索 1 條');
    expect(items).toContainEqual({ level: 'warn', text: '還沒決定場景的線索：C5' });
    expect(
      items.some((x) => x.level === 'mid' && x.text.startsWith('沒有連到推理的線索：C5')),
    ).toBe(true);
    p.clues[0].links = [];
    expect(checkPlot(p).find((x) => x.deduction === 'n1')?.level).toBe('mid');
    expect(checkPlot(blankPlot()).find((x) => x.level === 'info')?.text).toContain('S1');
    expect(checkPlot({ deductions: [], scenes: [], clues: [] })[0].level).toBe('warn');
  });

  it('刪除：推理拿掉線索的連結、場景的線索移到「還沒決定場景」；確認的條件；場景上下移', () => {
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

  it('從卡片做草稿：推理 3 個、場景 6 個（導入～結局）、線索 2 條連到推理', () => {
    const sc = drawn('seed');
    sc.npc.name = '沈靜如';
    setAnswer(sc, 'clue', '委託人自己');
    const p = seedPlot(M, sc);
    expect(p.deductions).toHaveLength(3);
    expect(p.scenes.map((s) => s.name.split('：')[0])).toEqual([
      '導入',
      '調查',
      '問話',
      '障礙',
      '高潮',
      '結局',
    ]);
    expect(p.clues).toHaveLength(2);
    expect(p.clues[0].text).toBe(`${findCard(M, sc.slots.clue.card)?.title}：委託人自己`);
    expect(p.clues[0].scene).toBe(p.scenes[1].id);
    expect(p.clues[0].links).toEqual([p.deductions[0].id]);
    expect(p.clues[1].text).toBe('沈靜如的話');
    expect(plotLines(p)[0]).toBe('PL 要查明的事');
  });
});

describe('專案檔與自動存檔', () => {
  it('往返：存的資料讀回來一模一樣', () => {
    const sc = drawn('rt', { pcCount: 3 });
    drawPcCards(M, sc, seededRandom('p'));
    setAnswer(sc, 'truth', '真相\n第二行');
    setQuestion(M, sc, 'npc', '改寫的問題');
    sc.title = '我的劇本';
    sc.extras.push({ id: 'x-1', name: '阿明', role: '弟弟', tie: '' });
    sc.plot = seedPlot(M, sc);
    const data = JSON.parse(JSON.stringify({ scenario: sc }));
    expect(scenarioFromProject(data, PROJECT_VERSION)).toEqual(sc);
  });

  it('較新的版本、不是劇本：丟出可以顯示的錯誤', () => {
    const sc = drawn('v');
    expect(() => scenarioFromProject({ scenario: sc }, PROJECT_VERSION + 1)).toThrow(
      ProjectFileError,
    );
    expect(() => scenarioFromProject({ scenario: sc }, PROJECT_VERSION + 1)).toThrow(/較新版本/);
    expect(() => scenarioFromProject({}, 1)).toThrow(/沒有劇本的資料/);
    expect(() => scenarioFromProject({ scenario: { deck: 'scifi' } }, 1)).toThrow(ProjectFileError);
  });

  it('壞掉的欄位：不認得的卡丟掉、別的卡的回答丟掉、PC 人數夾在 1～4、沒有卡的「抽好了」回到開始', () => {
    const sc = sanitizeScenario({
      deck: 'fantasy',
      mission: 'nope',
      tone: 'dark',
      pcCount: 9,
      phase: 'done',
      step: 'weird',
      slots: {
        core: { card: 'core.devil', locked: true },
        intro: { card: 'intro.nope' },
        npc: { card: 'clue.crest' },
      },
      answers: {
        core: { card: 'core.devil', text: '簽下真名' },
        intro: { card: 'intro.guild', text: '不在欄上' },
        bogus: { card: 'core.devil', text: 'x' },
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
    expect(sc.tone).toBe('dark');
    expect(sc.pcCount).toBe(4);
    expect(sc.slots.core).toEqual({ card: 'core.devil', locked: true });
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
  it('劇情大綱：卡齊了才有；真相的 {tone} 第一次寫全名、之後寫稱呼', () => {
    expect(synopsis(M, newScenario('modern'))).toBeNull();
    expect(
      fillTone(
        'A{tone}B{tone}C{stage}',
        { title: '不能回頭的樓梯', ref: '那段樓梯' },
        '怪異',
        '舞台',
      ),
    ).toBe('A那段樓梯（怪異「不能回頭的樓梯」）B那段樓梯C舞台');
    expect(fillTone('{tone}／{tone}', { title: '卡名' }, '怪異', '')).toBe(
      '怪異「卡名」／「卡名」',
    );
    const sc = drawn('syn');
    const sy = synopsis(M, sc);
    const stage = findCard(M, sc.slots.stage.card)?.title ?? '';
    const intro = findCard(M, sc.slots.intro.card);
    expect(sy?.open[0]).toBe(
      `舞台是「${stage}」。PC 們${intro?.via}，捲入了這起事件。${M.tones[0].opener.replace('{title}', findCard(M, sc.slots.tone.card)?.title ?? '')}`,
    );
    expect(sy?.truth).toContain(`「${stage}」`);
    expect(sy?.truth).not.toMatch(/\{(tone|stage)\}/);
  });

  it('文字檔：劇本名、題材與氣氛、大綱、登場人物、場景與線索、每張卡的問題與回答', () => {
    const sc = drawn('txt');
    drawPcCards(M, sc, seededRandom('t'));
    setAnswer(sc, 'core', '第一行\n第二行');
    sc.plot = seedPlot(M, sc);
    const text = outlineText(M, sc);
    const lines = text.split('\n');
    expect(lines[0]).toBe(autoTitle(M, sc));
    expect(lines[2]).toBe('題材：調查・偵探／氣氛：怪奇・恐怖');
    expect(text).toContain('【劇情大綱的例子】');
    expect(text).toContain('【登場人物】\n■ PC1\n　關係的對象：PC2');
    expect(text).toContain('【場景與線索】\nPL 要查明的事\nN1 ');
    expect(text).toContain(`■ 體驗的核心：${findCard(M, sc.slots.core.card)?.title}`);
    expect(text).toContain('　回答：第一行\n　　　　第二行');
    expect(text).toContain('■ 關係（PC1 → PC2）：');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('文件的 HTML：使用者的字一律跳脫；章節與 PC', () => {
    const sc = drawn('html');
    drawPcCards(M, sc, seededRandom('h'));
    sc.title = '<script>alert(1)</script>';
    setAnswer(sc, 'stage', 'a & b <b>');
    const html = documentHtml(M, sc, new Date(2026, 10, 15));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b &lt;b&gt;');
    expect(html).toContain('2026/11/15');
    expect(html.match(/data-doc-section=/g)).toHaveLength(4);
    expect(html.match(/data-doc-pc=/g)).toHaveLength(2);
    sc.plot = seedPlot(M, sc);
    expect(documentHtml(M, sc).match(/data-doc-section=/g)).toHaveLength(5);
  });

  it('劇本排版台的格式：劇本排版台照 markdown 讀得出標題、章節、手冊（秘密）、NPC 卡與線索的表格', () => {
    const sc = drawn('md');
    drawPcCards(M, sc, seededRandom('m'));
    sc.title = '霧裡的廟口';
    sc.npc.name = '沈靜如';
    sc.plot = seedPlot(M, sc);
    const md = editorMarkdown(M, sc);
    const { blocks, marked } = mdParse(md, { skip: [], ho: new Set(), tpls: [] });
    expect(marked).toBe(true);
    const types = blocks.map((b) => b.type);
    expect(types[0]).toBe('title');
    expect(blocks[0].text).toBe('霧裡的廟口');
    expect(types).toContain('subtitle');
    expect(blocks.filter((b) => b.type === 'h1').map((b) => b.text)).toEqual([
      '劇情大綱的例子',
      '體驗的核心與故事的骨架',
      '舞台與怪異',
      '場景與線索',
      '登場人物',
    ]);
    const handouts = blocks.filter((b) => b.type === 'handout');
    expect(handouts).toHaveLength(2);
    expect(handouts[0].text).toContain('秘密「');
    const npc = blocks.find((b) => b.type === 'npc');
    expect(npc?.npc?.name).toBe('沈靜如');
    const tables = blocks.filter((b) => b.type === 'table');
    expect(tables.length).toBeGreaterThan(0);
    const tbl = tables[0].tbl;
    expect(tbl && cellsRead(tbl)[0]).toEqual(['編號', '線索', '取得的方法', '連到']);
    expect(tbl && cellsRead(tbl)[1][0]).toBe('C1');
    expect(blocks.filter((b) => b.type === 'note').length).toBeGreaterThanOrEqual(9);
  });

  it('卡片的數量：每一類各一欄，PC 的卡另外', () => {
    expect(STORY_KEYS).toHaveLength(9);
    expect(cardsOf(M, 'relation').length).toBeGreaterThanOrEqual(4);
  });
});
