/**
 * 劇本排版台：NPC 卡的自動計算（3.7.2）、CCFOLIA 棋子（3.7.3）、讀入棋子（3.7.4）、Yutosheet（3.7.6）。
 */
import { describe, expect, it } from 'vitest';
import {
  ccfApply,
  ccfoliaText,
  ccfParse,
  ccfSplitName,
  npcToCcfolia,
  ytApply,
  ytGuess,
  ytParse,
} from '../../src/tools/scenario-editor/model/npc/ccfolia';
import {
  computeNpcAuto,
  ensureNpc,
  newDxEffect,
  newNpcData,
  npcEff,
} from '../../src/tools/scenario-editor/model/npc/model';
import type { Npc } from '../../src/tools/scenario-editor/model/types';

function emo(): Npc {
  const np = newNpcData();
  np.name = '遙';
  np.kana = 'はるか';
  np.role = '學生';
  Object.assign(np.emoklore.ab, {
    body: '3',
    dex: '2',
    mind: '4',
    sense: '5',
    int: '2',
    cha: '3',
    soc: '1',
    luck: '2',
  });
  np.emoklore.kyodo = '3';
  np.emoklore.skills = [{ n: '〈マッピング〉', cat: '', arg: '', ref: '', lv: '2', v: '' }];
  return np;
}

describe('自動計算（3.7.2）', () => {
  it('Emoklore：HP＝身体＋10、MP＝精神＋知力、技能判定值取參照能力中較高的', () => {
    const A = computeNpcAuto(emo());
    expect(A['emoklore.hp']).toBe(13);
    expect(A['emoklore.mp']).toBe(6);
    /* 〈マッピング〉的參照能力：器用 2、五感 5 → 五感 */
    expect(A['emoklore.skills.0.v']).toBe(2 + 5);
    expect(A['emoklore.base.調査']).toBe(2);
  });
  it('手動值優先，空白回到自動', () => {
    const np = emo();
    np.emoklore.hp = '20';
    const A = computeNpcAuto(np);
    expect(npcEff(np, A, 'emoklore.hp')).toBe('20');
    np.emoklore.hp = '';
    expect(npcEff(np, computeNpcAuto(np), 'emoklore.hp')).toBe('13');
  });
  it('DX3rd：行動值＝感覺×2＋精神；組合技合計侵蝕值、不重複的值以「／」接起來', () => {
    const np = newNpcData();
    np.sys = 'dx3rd';
    Object.assign(np.dx3rd.ab, { sense: '3', mind: '2' });
    np.dx3rd.effects = [
      {
        ...newDxEffect(),
        id: 'a',
        n: '集中',
        enc: '2',
        skill: '白兵',
        tgt: '—',
        rng: '武器',
        timing: 'メジャー',
      },
      {
        ...newDxEffect(),
        id: 'b',
        n: '爪',
        enc: '3',
        skill: '白兵',
        tgt: '單體',
        rng: '至近',
        timing: 'メジャー',
      },
    ];
    np.dx3rd.combos = [
      {
        n: '組合',
        cmb: '',
        pick: ['a', 'b'],
        extra: '',
        timing: '',
        skill: '',
        hit: '',
        atk: '',
        tgt: '',
        rng: '',
        enc: '',
        cond: '',
        eff: '',
      },
    ];
    const A = computeNpcAuto(np);
    expect(A['dx3rd.act']).toBe(8);
    expect(A['dx3rd.combos.0.enc']).toBe(5);
    expect(A['dx3rd.combos.0.skill']).toBe('白兵');
    expect(A['dx3rd.combos.0.tgt']).toBe('單體');
    expect(A['dx3rd.combos.0.rng']).toBe('武器／至近');
  });
  it('克蘇魯第 6 版與第 7 版', () => {
    const np = newNpcData();
    np.sys = 'coc';
    Object.assign(np.coc.ab, { con: '11', siz: '14', pow: '12', int: '13', edu: '16' });
    np.coc.ver = '6';
    expect(computeNpcAuto(np)).toMatchObject({
      'coc.sub.hp': 13,
      'coc.sub.mp': 12,
      'coc.sub.san': 60,
      'coc.sub.idea': 65,
      'coc.sub.luck': 60,
      'coc.sub.know': 80,
      'coc.sub.mov': 8,
    });
    Object.assign(np.coc.ab, { con: '55', siz: '70', pow: '60' });
    np.coc.ver = '7';
    expect(computeNpcAuto(np)).toMatchObject({
      'coc.sub.hp': 12,
      'coc.sub.mp': 12,
      'coc.sub.san': 60,
    });
  });
});

describe('CCFOLIA 棋子（3.7.3）', () => {
  it('Emoklore：狀態、參數、共鳴判定、習得技能、基本技能', () => {
    const c = npcToCcfolia(emo());
    expect(c.kind).toBe('character');
    expect(c.data).toMatchObject({
      name: '遙',
      memo: 'はるか\n學生',
      initiative: 0,
      externalUrl: '',
      iconUrl: null,
      faces: [],
    });
    expect(c.data.status).toEqual([
      { label: 'HP', value: 13, max: 13 },
      { label: 'MP', value: 6, max: 6 },
      { label: '共鳴', value: 1, max: 9 },
    ]);
    expect(c.data.params[0]).toEqual({ label: '身体', value: '3' });
    expect(c.data.params.at(-1)).toEqual({ label: '強度', value: '3' });
    const lines = c.data.commands.split('\n');
    expect(lines.slice(0, 4)).toEqual([
      '{共鳴}DM<={強度} 〈∞共鳴〉',
      '({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致',
      '({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致',
      '2DM<=7 〈マッピング〉',
    ]);
    expect(lines).toContain('1DM<=2 〈＊調査〉');
  });
  it('DX3rd：侵蝕率、行動值、技能、效果、組合技', () => {
    const np = newNpcData();
    np.sys = 'dx3rd';
    np.name = '';
    Object.assign(np.dx3rd, { breed: 'cross', syns: ['balor', 'neum', ''], enc: '40', hp: '30' });
    Object.assign(np.dx3rd.ab, { body: '2', sense: '3', mind: '4', soc: '1' });
    np.dx3rd.skills.melee = '2';
    np.dx3rd.skills.know = '1';
    np.dx3rd.sarg.know = 'レネゲイド';
    np.dx3rd.effects = [
      { ...newDxEffect(), id: 'e', kind: 'balor', n: '黒の鉄槌', lv: '2', timing: 'メジャー' },
    ];
    np.dx3rd.combos = [
      {
        n: '鉄槌',
        cmb: '',
        pick: [],
        extra: '',
        timing: '',
        skill: '',
        hit: '7dx@8',
        atk: '+10',
        tgt: '',
        rng: '',
        enc: '4',
        cond: '',
        eff: '',
      },
    ];
    const c = npcToCcfolia(np);
    expect(c.data.name).toBe('NPC');
    expect(c.data.initiative).toBe(10);
    expect(c.data.status).toEqual([
      { label: 'HP', value: 30, max: 30 },
      { label: '侵蝕率', value: 40, max: 100 },
    ]);
    expect(c.data.params).toContainEqual({ label: 'シンドローム', value: 'バロール／ノイマン' });
    expect(c.data.params).toContainEqual({ label: '行動値', value: '10' });
    expect(c.data.commands.split('\n')).toEqual([
      '2dx@10 【白兵】',
      '1dx@10 【知識:レネゲイド】',
      '// [バロール] 黒の鉄槌 Lv2 / メジャー',
      '// コンボ：鉄槌 / 7dx@8 / 攻撃力+10 / 侵蝕4',
    ]);
  });
  it('克蘇魯第 7 版：SAN、幸運、技能、武器、DB、能力值檢定', () => {
    const np = newNpcData();
    np.sys = 'coc';
    Object.assign(np.coc.ab, {
      str: '50',
      con: '60',
      pow: '55',
      dex: '40',
      app: '50',
      siz: '65',
      int: '70',
      edu: '80',
    });
    np.coc.sub.db = '1D4';
    np.coc.skills = [{ n: '運転', cat: '', arg: '自動車', v: '40', free: false }];
    np.coc.weapons = [{ n: '杖', v: '45', dmg: '1D4+DB' }];
    const c = npcToCcfolia(np);
    expect(c.data.initiative).toBe(40);
    expect(c.data.status.map((s) => s.label)).toEqual(['HP', 'MP', 'SAN', '幸運']);
    expect(c.data.params.slice(-2)).toEqual([
      { label: 'BLD', value: '0' },
      { label: 'MOV', value: '0' },
    ]);
    const lines = c.data.commands.split('\n');
    expect(lines.slice(0, 7)).toEqual([
      'CC<={SAN} 【正気度ロール】',
      'CC<=0 【アイデア】',
      'CC<={幸運} 【幸運】',
      'CC<=0 【知識】',
      'CC<=40 【運転:自動車】',
      'CC<=45 【杖】',
      '1d3+1D4 【ダメージ判定】',
    ]);
    expect(lines.at(-1)).toBe('CC<={EDU}　【EDU】');
  });
  it('克蘇魯：技能名稱空白、只填專業領域時照原作輸出「【:領域】」，兩個都空白時略過（F167）', () => {
    const np = newNpcData();
    np.sys = 'coc';
    np.coc.skills = [
      { n: '', cat: '', arg: '歴史', v: '75', free: false },
      { n: '', cat: '', arg: '', v: '30', free: false },
      { n: '  ', cat: '', arg: ' ', v: '20', free: false },
    ];
    const lines = npcToCcfolia(np).data.commands.split('\n');
    expect(lines).toContain('CC<=75 【:歴史】');
    expect(lines.filter((l) => l.startsWith('CC<=30') || l.startsWith('CC<=20'))).toEqual([]);
  });
  it('克蘇魯第 6 版：CCB、1d100 的理智、能力值 ×5', () => {
    const np = newNpcData();
    np.sys = 'coc';
    np.coc.ver = '6';
    Object.assign(np.coc.ab, { pow: '12', int: '13', edu: '15' });
    np.coc.sub.db = '-1D4';
    const lines = npcToCcfolia(np).data.commands.split('\n');
    expect(lines.slice(0, 4)).toEqual([
      '1d100<={SAN} 【正気度ロール】',
      'CCB<=65 【アイデア】',
      'CCB<=60 【幸運】',
      'CCB<=75 【知識】',
    ]);
    expect(lines).toContain('1d6-1D4 【ダメージ判定】');
    expect(lines.at(-1)).toBe('CCB<={EDU}*5 【EDU × 5】');
  });
  it('以 1 格縮排的 JSON 輸出', () => {
    expect(ccfoliaText(emo()).split('\n')[1]).toBe(' "kind": "character",');
  });
});

describe('讀入 CCFOLIA 棋子（3.7.4）', () => {
  it('前後多了文字也能讀、名字與讀音、立場', () => {
    const d = ccfParse(
      '複製來的：{"kind":"character","data":{"name":"管家 (かんりにん)","memo":"立場: 管家\\n年齡: 60","params":[{"label":"STR","value":"50"}],"status":[{"label":"SAN","value":40,"max":55}],"commands":"CC<=60 【目星】\\nCC<=40 【運転（自動車）】"}} 以上',
    );
    expect(d).not.toBeNull();
    const np = newNpcData();
    if (!d) return;
    const r = ccfApply(np, d);
    expect(r.sys).toBe('coc');
    expect(np.name).toBe('管家');
    expect(np.kana).toBe('かんりにん');
    expect(np.role).toBe('立場: 管家 年齡: 60');
    expect(np.coc.ab.str).toBe('50');
    expect(np.coc.sub.san).toBe('55');
    expect(np.coc.skills.slice(0, 2).map((s) => [s.n, s.arg, s.v])).toEqual([
      ['目星', '', '60'],
      ['運転', '自動車', '40'],
    ]);
    expect(r.skills).toBe(2);
  });
  it('判斷不了系統時報告（名字照樣填入）', () => {
    const np = newNpcData();
    const r = ccfApply(np, ccfParse('{"name":"謎","params":[{"label":"X","value":"1"}]}') as never);
    expect(r.sys).toBeNull();
    expect(np.name).toBe('謎');
  });
  it('讀不懂的文字回傳 null；名字的全形括號', () => {
    expect(ccfParse('abc')).toBeNull();
    expect(ccfSplitName('遙（はるか）')).toEqual({ name: '遙', kana: 'はるか' });
  });
  it('棋子輸出後讀回：Emoklore 的技能與能力值', () => {
    const src = emo();
    const back = ensureNpc(null);
    const r = ccfApply(back, ccfParse(JSON.stringify(npcToCcfolia(src))) as never);
    expect(r.sys).toBe('emoklore');
    expect(back.emoklore.ab).toEqual(src.emoklore.ab);
    expect(back.emoklore.skills[0].n).toContain('マッピング');
    expect(back.emoklore.kyodo).toBe('3');
  });
});

describe('Yutosheet 的表格（3.7.6）', () => {
  const effects =
    '|バロール / コンセントレイト：バロール / 2 / メジャー / シンドローム / ― / ― / ― / 2 / ― |\n|バロール / 黒の鉄槌 / 3 / メジャー / RC / 対決 / 単体 / 視界 / 2 / ― |';
  it('切開、略過標題行與太短的行、還原跳脫', () => {
    const rows = ytParse(
      `名称 / Lv / タイミング / 技能 / 難易度\n${effects}\n短 / 行\n|甲&lt;br&gt;乙 / 1 / 2 / 3 / 4|`,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0][1]).toBe('コンセントレイト：バロール');
    expect(rows[2][0]).toBe('甲<br>乙'.replace('<br>', '\n'));
  });
  it('自動判斷效果表或組合技表、取代清單', () => {
    expect(ytGuess(ytParse(effects))).toBe('effect');
    const combo =
      '|鉄槌 / 〈コンセントレイト〉+〈黒の鉄槌〉 / RC / 7dx@8 / 20 / 単体 / 視界 / 4 / 100%以上 / 装甲無視|';
    expect(ytGuess(ytParse(combo))).toBe('combo');
    const np = newNpcData();
    expect(ytApply(np, ytParse(combo), 'combo')).toBe(1);
    expect(np.sys).toBe('dx3rd');
    expect(np.dx3rd.combos[0]).toMatchObject({
      n: '鉄槌',
      skill: 'RC',
      hit: '7dx@8',
      atk: '20',
      enc: '4',
      eff: '装甲無視',
    });
    expect(ytApply(np, ytParse(effects), 'effect')).toBe(2);
    expect(np.dx3rd.effects[1]).toMatchObject({
      kind: 'balor',
      n: '黒の鉄槌',
      lv: '3',
      timing: 'メジャー',
      skill: 'RC',
      enc: '2',
    });
  });
});
