/**
 * 先攻與戰鬥追蹤的規則（規格 docs/refactor/specs/combat-tracker.md 第 3 節）：
 * 同名多隻的字尾、排序、下一位／上一位與跳過、狀態的持續回合、臨時 HP、5e 的死亡豁免與大量傷害、專注的 DC、
 * HP 欄的寫法、擲先攻（同名共用）、原作 JSON 的讀寫、存檔的整理、玩家視圖的內容、複製的文字。
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  addCombatants,
  addCondition,
  addSeeds,
  appendCombatants,
  applyDamage,
  applyDeathSave,
  applyHeal,
  baseName,
  type CombatData,
  currentId,
  duplicateCombatant,
  grantTemp,
  initialData,
  moveCombatant,
  namesFor,
  newEncounter,
  nextTurn,
  OriginalJsonError,
  orderText,
  originalJson,
  originalJsonName,
  parseHpEntry,
  parseOriginalJson,
  playerSnapshot,
  prevTurn,
  removeCombatants,
  rollInitiatives,
  roughHp,
  sanitizeData,
  setDeathCount,
  setHp,
  setInit,
  setMaxHp,
  suffixLetters,
} from '@/tools/combat-tracker/model';

/** 固定的亂數：依序回傳 vals（d20 的 x → (x − 1) / 20） */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};
const d20 = (...faces: number[]) => seq(...faces.map((f) => (f - 1) / 20 + 0.001));

function make(edit?: (d: CombatData) => void): CombatData {
  const d = initialData();
  edit?.(d);
  return d;
}

const add = (
  d: CombatData,
  name: string,
  init: number | null,
  extra: Partial<Parameters<typeof addCombatants>[1]> = {},
) =>
  addCombatants(d, {
    name,
    side: 'enemy',
    init,
    initMod: null,
    maxHp: null,
    ac: null,
    qty: 1,
    ...extra,
  });

const names = (d: CombatData) => d.list.map((c) => c.name);

describe('同名多隻的字尾', () => {
  it('A、B…Z、AA 與反向', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(suffixLetters)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
    ]);
    expect(baseName('地精 C')).toBe('地精');
    expect(baseName('地精')).toBe('地精');
    expect(baseName('Goblin AB')).toBe('Goblin');
    expect(baseName('A')).toBe('A');
  });

  it('原作的規則：一隻且沒有同名時不加；多隻或已有同名時接著編', () => {
    expect(namesFor([], '地精', 1)).toEqual(['地精']);
    expect(namesFor([], '地精', 3)).toEqual(['地精 A', '地精 B', '地精 C']);
    expect(namesFor([{ name: '地精' }], '地精', 1)).toEqual(['地精 B']);
    expect(namesFor([{ name: '地精 A' }, { name: '地精 B' }], '地精', 2)).toEqual([
      '地精 C',
      '地精 D',
    ]);
    /* 刪掉中間的也不會重複（原作會再用一次 C） */
    expect(namesFor([{ name: '地精 A' }, { name: '地精 C' }], '地精', 1)).toEqual(['地精 D']);
    /* 開頭一樣但不同名的不算（原作用 startsWith） */
    expect(namesFor([{ name: '地精王' }], '地精', 1)).toEqual(['地精']);
  });
});

describe('加入與排序', () => {
  it('已經有一隻沒有字尾的同名者時，再加同名的：原本的補成 A、新的從 B 開始（D12）；已經有 A 時不改', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      add(x, '龍', 20);
      add(x, '龍', 18);
    });
    expect(names(d)).toEqual(['龍 A', '龍 B']);
    const many = make((x) => {
      x.settings.initDie = 'none';
      add(x, '龍', 20);
      add(x, '龍', 18, { qty: 2 });
      add(x, '狼', 5);
    });
    expect(names(many)).toEqual(['龍 A', '龍 B', '龍 C', '狼']);
    /* 「龍」與「龍 A」都在（使用者自己改名的）：不改「龍」，新的接著編 */
    const both = make((x) => {
      x.settings.initDie = 'none';
      add(x, '龍', 20);
      add(x, '龍 A', 19);
      add(x, '龍', 18);
    });
    expect(names(both)).toEqual(['龍', '龍 A', '龍 B']);
    /* 送來的參戰者也一樣 */
    const seeds = make((x) => {
      x.settings.initDie = 'none';
      add(x, '食人魔', 10);
      addSeeds(x, [{ name: '食人魔', init: 9 }]);
    });
    expect(names(seeds)).toEqual(['食人魔 A', '食人魔 B']);
  });

  it('依先攻由高到低、同分保持加入順序、沒有先攻值的排最後', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      add(x, '甲', 10);
      add(x, '乙', null);
      add(x, '丙', 15);
      add(x, '丁', 10);
    });
    expect(names(d)).toEqual(['丙', '甲', '丁', '乙']);
  });

  it('鎖定順序時加在最後、改先攻也不重排；拖曳也不動', () => {
    const d = make((x) => {
      x.settings.lockOrder = true;
      add(x, '甲', 10);
      add(x, '乙', 20);
      setInit(x, x.list[0].id, 1);
      moveCombatant(x, 0, 1);
    });
    expect(names(d)).toEqual(['甲', '乙']);
    expect(d.list[0].init).toBe(1);
  });

  it('數量 1～20、HP 上限同時是目前的 HP、名字 60 字、清單最多 200 位', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      addCombatants(x, {
        name: `  ${'長'.repeat(80)}  `,
        side: 'enemy',
        init: 5,
        initMod: 2,
        maxHp: 7,
        ac: 15,
        qty: 99,
      });
    });
    expect(d.list).toHaveLength(20);
    expect(d.list[0].name).toBe(`${'長'.repeat(60)} A`);
    expect(d.list[0]).toMatchObject({ hp: 7, maxHp: 7, ac: 15, init: 5, initMod: 2, temp: 0 });
    const full = make((x) => {
      x.settings.initDie = 'none';
      for (let i = 0; i < 11; i++) add(x, `第${i}`, i, { qty: 20 });
    });
    expect(full.list).toHaveLength(200);
  });

  it('先攻空白時擲骰：同名的一起擲時共用一次；分開擲時各擲各的；不擲時空白', () => {
    const shared = make((x) => {
      addCombatants(
        x,
        { name: '狼', side: 'enemy', init: null, initMod: 2, maxHp: 11, ac: 13, qty: 3 },
        d20(7, 18, 3),
      );
    });
    expect(shared.list.map((c) => c.init)).toEqual([9, 9, 9]);
    const each = make((x) => {
      x.settings.groupRoll = false;
      addCombatants(
        x,
        { name: '狼', side: 'enemy', init: null, initMod: 2, maxHp: 11, ac: 13, qty: 3 },
        d20(7, 18, 3),
      );
    });
    expect(each.list.map((c) => c.init)).toEqual([20, 9, 5]);
    const none = make((x) => {
      x.settings.initDie = 'none';
      add(x, '狼', null, { initMod: 2 });
    });
    expect(none.list[0].init).toBeNull();
  });

  it('1d10、2d6 的範圍', () => {
    const d = make((x) => {
      x.settings.initDie = '2d6';
      x.settings.groupRoll = false;
      addCombatants(
        x,
        { name: '甲', side: 'enemy', init: null, initMod: 0, maxHp: null, ac: null, qty: 2 },
        seq(0, 0, 0.999, 0.999),
      );
    });
    expect(d.list.map((c) => c.init).sort()).toEqual([12, 2]);
  });

  it('別的工具送來的參戰者：一定擲 d20＋加值（同一筆共用），陣營、HP、AC、備註', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      addSeeds(
        x,
        [
          {
            name: 'CR 2 的怪物',
            count: 2,
            hp: 45,
            ac: 13,
            initMod: 0,
            rollInit: true,
            note: 'CR 2',
          },
          { name: '嚮導', side: 'ally', init: 14 },
        ],
        d20(11),
      );
    });
    expect(d.list.map((c) => [c.name, c.side, c.init, c.hp, c.ac, c.note])).toEqual([
      ['嚮導', 'ally', 14, null, null, ''],
      ['CR 2 的怪物 A', 'enemy', 11, 45, 13, 'CR 2'],
      ['CR 2 的怪物 B', 'enemy', 11, 45, 13, 'CR 2'],
    ]);
  });

  it('擲先攻：NPC 才擲、同名共用、排序', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      add(x, '艾琳', 12, { side: 'pc' });
      add(x, '狼', null, { qty: 2, initMod: 2 });
      add(x, '頭目', null, { initMod: 5 });
      x.settings.initDie = 'd20';
      expect(rollInitiatives(x, 'npc', d20(3, 14))).toBe(3);
    });
    expect(d.list.map((c) => [c.name, c.init])).toEqual([
      ['頭目', 19],
      ['艾琳', 12],
      ['狼 A', 5],
      ['狼 B', 5],
    ]);
  });

  it('複製一份：加字尾（原本沒有字尾的補成 A）、HP 回到上限、狀態清空', () => {
    const d = make((x) => {
      x.settings.initDie = 'none';
      add(x, '食人魔', 8, { maxHp: 59 });
      applyDamage(x, x.list[0].id, 20);
      addCondition(x, [x.list[0].id], { kind: 'srd', key: 'prone', rounds: null });
      duplicateCombatant(x, x.list[0].id);
    });
    expect(d.list.map((c) => [c.name, c.hp, c.conds.length])).toEqual([
      ['食人魔 A', 39, 1],
      ['食人魔 B', 59, 0],
    ]);
  });
});

describe('回合', () => {
  const three = () =>
    make((x) => {
      x.settings.initDie = 'none';
      add(x, '甲', 20, { maxHp: 10 });
      add(x, '乙', 15, { maxHp: 10 });
      add(x, '丙', 10, { maxHp: 10 });
    });

  it('還沒開始時第一位是目前；下一位依序、繞回時輪數 +1；上一位往回、輪數最少 1', () => {
    const d = three();
    expect(currentId(d)).toBe(d.list[0].id);
    const seen: string[] = [];
    const rounds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = nextTurn(d);
      seen.push(d.list.find((c) => c.id === r.id)?.name ?? '');
      rounds.push(d.round);
    }
    expect(seen).toEqual(['乙', '丙', '甲', '乙']);
    expect(rounds).toEqual([1, 1, 2, 2]);
    prevTurn(d);
    prevTurn(d);
    expect(d.round).toBe(1);
    expect(currentId(d)).toBe(d.list[2].id);
    prevTurn(d);
    prevTurn(d);
    expect(d.round).toBe(1);
  });

  it('跳過 0 HP 的敵方與死亡的；玩家角色在 0 HP 不跳過；全部都能跳過時照樣下一位；關掉時不跳', () => {
    const d = three();
    d.list[1].hp = 0;
    expect(nextTurn(d).id).toBe(d.list[2].id);
    d.list[1].side = 'pc';
    nextTurn(d);
    expect(nextTurn(d).id).toBe(d.list[1].id);
    d.list[1].death.dead = true;
    expect(nextTurn(d).id).toBe(d.list[2].id);
    for (const c of d.list) c.hp = 0;
    expect(nextTurn(d).id).toBe(d.list[0].id);
    d.settings.skipDown = false;
    d.list[0].hp = 10;
    expect(nextTurn(d).id).toBe(d.list[1].id);
  });

  it('狀態的持續回合：輪到那位時減 1，到 0 拿掉；不限的不動', () => {
    const d = three();
    const b = d.list[1].id;
    addCondition(d, [b], { kind: 'srd', key: 'prone', rounds: 2 });
    addCondition(d, [b], { kind: 'custom', key: '祝福', rounds: 1 });
    addCondition(d, [b], { kind: 'srd', key: 'poisoned', rounds: null });
    const r1 = nextTurn(d);
    expect(r1.expired.map((k) => k.key)).toEqual(['祝福']);
    expect(d.list[1].conds.map((k) => [k.key, k.rounds])).toEqual([
      ['prone', 1],
      ['poisoned', null],
    ]);
    nextTurn(d);
    nextTurn(d);
    const r2 = nextTurn(d);
    expect(r2.expired.map((k) => k.key)).toEqual(['prone']);
    expect(d.list[1].conds.map((k) => k.key)).toEqual(['poisoned']);
  });

  it('同一個狀態不重複（改成這次的持續回合）；力竭的等級 1～6；看不懂的 SRD 鍵不加', () => {
    const d = three();
    const a = d.list[0].id;
    addCondition(d, [a], { kind: 'srd', key: 'prone', rounds: 3 });
    addCondition(d, [a], { kind: 'srd', key: 'prone', rounds: null });
    addCondition(d, [a], { kind: 'srd', key: 'exhaustion', rounds: null, level: 9 });
    expect(addCondition(d, [a], { kind: 'srd', key: 'nope', rounds: null })).toBe(0);
    expect(d.list[0].conds.map((k) => [k.key, k.rounds, k.level])).toEqual([
      ['prone', null, undefined],
      ['exhaustion', null, 6],
    ]);
  });

  it('刪掉目前輪到的人：換成下一位；全部刪掉時回到還沒開始', () => {
    const d = three();
    nextTurn(d);
    removeCombatants(d, [d.list[1].id]);
    expect(currentId(d)).toBe(d.list[1].id);
    expect(names(d)).toEqual(['甲', '丙']);
    removeCombatants(
      d,
      d.list.map((c) => c.id),
    );
    expect(d.turn).toBeNull();
  });

  it('改先攻時目前輪到的人跟著那位參戰者', () => {
    const d = three();
    nextTurn(d);
    const b = d.list[1].id;
    setInit(d, b, 30);
    expect(names(d)).toEqual(['乙', '甲', '丙']);
    expect(currentId(d)).toBe(b);
  });

  it('新的戰鬥：只留玩家角色、輪數 1、從第一位開始', () => {
    const d = three();
    d.list[2].side = 'pc';
    nextTurn(d);
    nextTurn(d);
    nextTurn(d);
    newEncounter(d);
    expect(names(d)).toEqual(['丙']);
    expect(d.round).toBe(1);
    expect(d.turn).toBeNull();
  });
});

describe('HP', () => {
  const one = (side: 'pc' | 'enemy' = 'pc', max = 20) =>
    make((x) => {
      x.settings.initDie = 'none';
      add(x, '艾琳', 10, { side, maxHp: max });
    });

  it('臨時 HP 先扣、不相加（留比較多的）、治療不回復臨時 HP', () => {
    const d = one();
    const id = d.list[0].id;
    grantTemp(d, id, 5);
    grantTemp(d, id, 3);
    expect(d.list[0].temp).toBe(5);
    applyDamage(d, id, 7);
    expect(d.list[0]).toMatchObject({ temp: 0, hp: 18 });
    applyHeal(d, id, 10);
    expect(d.list[0]).toMatchObject({ temp: 0, hp: 20 });
    grantTemp(d, id, 4);
    applyDamage(d, id, 3);
    expect(d.list[0]).toMatchObject({ temp: 1, hp: 20 });
  });

  it('HP 不低於 0、不超過上限；改上限時目前的 HP 跟著降；清空上限＝不追蹤', () => {
    const d = one();
    const id = d.list[0].id;
    applyDamage(d, id, 99);
    expect(d.list[0].hp).toBe(0);
    setHp(d, id, 50);
    expect(d.list[0].hp).toBe(20);
    setMaxHp(d, id, 12);
    expect(d.list[0]).toMatchObject({ hp: 12, maxHp: 12 });
    setMaxHp(d, id, null);
    expect(d.list[0]).toMatchObject({ hp: null, maxHp: null });
    applyHeal(d, id, 5);
    expect(d.list[0].hp).toBeNull();
    setMaxHp(d, id, 30);
    expect(d.list[0]).toMatchObject({ hp: 30, maxHp: 30 });
  });

  it('HP 欄的寫法：+N 回復、-N 傷害、N 設定；全形與「−」也可以', () => {
    expect(parseHpEntry('+8')).toEqual({ kind: 'heal', n: 8 });
    expect(parseHpEntry('-8')).toEqual({ kind: 'damage', n: 8 });
    expect(parseHpEntry('−１２')).toEqual({ kind: 'damage', n: 12 });
    expect(parseHpEntry('＋３')).toEqual({ kind: 'heal', n: 3 });
    expect(parseHpEntry(' 15 ')).toEqual({ kind: 'set', n: 15 });
    expect(parseHpEntry('abc')).toBeNull();
    expect(parseHpEntry('')).toBeNull();
    expect(parseHpEntry('1.5')).toBeNull();
  });

  it('5e：0 HP 時受到傷害算一次失敗、重擊兩次，3 次失敗死亡；傷害達到上限當場死亡', () => {
    const d = one();
    const id = d.list[0].id;
    expect(applyDamage(d, id, 20)).toEqual([{ kind: 'down' }]);
    expect(applyDamage(d, id, 1)).toEqual([{ kind: 'failure', ng: 1 }]);
    expect(applyDamage(d, id, 1, { crit: true })).toEqual([{ kind: 'died', reason: 'failures' }]);
    expect(d.list[0].death.dead).toBe(true);
    const e = one();
    applyDamage(e, e.list[0].id, 20);
    expect(applyDamage(e, e.list[0].id, 20)).toEqual([{ kind: 'died', reason: 'massive' }]);
  });

  it('5e：大量傷害——降到 0 後剩下的傷害達到上限時死亡（SRD 的例：上限 12、剩 6、受到 18）', () => {
    const d = one('pc', 12);
    const id = d.list[0].id;
    applyDamage(d, id, 6);
    expect(applyDamage(d, id, 18)).toEqual([{ kind: 'died', reason: 'massive' }]);
    const e = one('pc', 12);
    applyDamage(e, e.list[0].id, 6);
    expect(applyDamage(e, e.list[0].id, 17)).toEqual([{ kind: 'down' }]);
    /* 敵方與關掉死亡豁免時不算 */
    const m = one('enemy', 12);
    expect(applyDamage(m, m.list[0].id, 99)).toEqual([{ kind: 'down' }]);
    const off = one('pc', 12);
    off.settings.deathSaves = false;
    expect(applyDamage(off, off.list[0].id, 99)).toEqual([{ kind: 'down' }]);
    expect(applyDamage(off, off.list[0].id, 99)).toEqual([]);
  });

  it('死亡豁免：10 以上成功、1 兩次失敗、20 回復 1 HP；3 次成功穩定；回復 HP 時歸零；死亡的不回復', () => {
    const d = one();
    const id = d.list[0].id;
    applyDamage(d, id, 20);
    expect(applyDeathSave(d, id, 10)).toBe('success');
    expect(applyDeathSave(d, id, 9)).toBe('failure');
    expect(applyDeathSave(d, id, 15)).toBe('success');
    expect(d.list[0].death).toEqual({ ok: 2, ng: 1, stable: false, dead: false });
    expect(applyDeathSave(d, id, 12)).toBe('success');
    expect(d.list[0].death).toEqual({ ok: 0, ng: 0, stable: true, dead: false });
    applyDamage(d, id, 1);
    expect(d.list[0].death.stable).toBe(false);
    expect(applyDeathSave(d, id, 1)).toBe('crit-fail');
    expect(d.list[0].death).toMatchObject({ ng: 3, dead: true });
    expect(applyHeal(d, id, 5)).toEqual([{ kind: 'dead-no-heal' }]);
    expect(d.list[0].hp).toBe(0);
    const e = one();
    applyDamage(e, e.list[0].id, 20);
    expect(applyDeathSave(e, e.list[0].id, 20)).toBe('crit-success');
    expect(e.list[0]).toMatchObject({ hp: 1, death: { ok: 0, ng: 0, stable: false, dead: false } });
    applyDamage(e, e.list[0].id, 1);
    applyDeathSave(e, e.list[0].id, 5);
    expect(applyHeal(e, e.list[0].id, 3)).toEqual([{ kind: 'revived' }]);
    expect(e.list[0].death.ng).toBe(0);
  });

  it('點格子設定次數：3 次成功＝穩定、3 次失敗＝死亡', () => {
    const d = one();
    const id = d.list[0].id;
    applyDamage(d, id, 20);
    setDeathCount(d, id, 'ok', 3);
    expect(d.list[0].death).toEqual({ ok: 0, ng: 0, stable: true, dead: false });
    setDeathCount(d, id, 'ng', 3);
    expect(d.list[0].death.dead).toBe(true);
  });

  it('專注中受到傷害：DC 10 或傷害的一半，最高 30；關掉 5e 的狀態時不提醒', () => {
    const d = one('pc', 200);
    const id = d.list[0].id;
    addCondition(d, [id], { kind: 'srd', key: 'concentration', rounds: null });
    expect(applyDamage(d, id, 7)).toEqual([{ kind: 'concentration', dc: 10 }]);
    expect(applyDamage(d, id, 25)).toEqual([{ kind: 'concentration', dc: 12 }]);
    expect(applyDamage(d, id, 100)[0]).toEqual({ kind: 'concentration', dc: 30 });
    d.settings.srdConds = false;
    expect(applyDamage(d, id, 7)).toEqual([]);
  });

  it('概略的 HP', () => {
    expect([10, 9, 6, 5, 1, 0].map((h) => roughHp(h, 10))).toEqual([
      'full',
      'hurt',
      'hurt',
      'bloodied',
      'bloodied',
      'down',
    ]);
  });
});

describe('文字、玩家視圖、存讀', () => {
  const party = () =>
    make((x) => {
      x.settings.initDie = 'none';
      add(x, '艾琳', 17, { side: 'pc', maxHp: 24 });
      add(x, '地精', 12, { qty: 2, maxHp: 7, ac: 15 });
      add(x, '伏兵', 5, { maxHp: 30 });
      x.list[3].hidden = true;
      x.list[1].hp = 0;
      x.list[0].temp = 3;
      x.list[0].note = 'GM 才看得到';
      addCondition(x, [x.list[2].id], { kind: 'srd', key: 'prone', rounds: 2 });
      addCondition(x, [x.list[2].id], { kind: 'custom', key: '標記', rounds: null });
      nextTurn(x);
    });

  it('複製的文字：先攻、名字、倒下、目前的標記；隱藏的不列', () => {
    expect(orderText(party())).toBe(
      ['**先攻順序**（第 1 輪）', '- 17：艾琳', '- 12：地精 A（倒下）', '- 12：地精 B ◀'].join(
        '\n',
      ),
    );
  });

  it('玩家視圖：隱藏的不送、HP 依設定（我方數字、敵方概略）、狀態、不送備註與 AC', () => {
    const d = party();
    const snap = playerSnapshot(d);
    expect(snap.round).toBe(1);
    expect(snap.rows.map((r) => r.name)).toEqual(['艾琳', '地精 A', '地精 B']);
    expect(snap.rows[0].hp).toEqual({ kind: 'exact', hp: 24, max: 24, temp: 3 });
    expect(snap.rows[1]).toMatchObject({ status: 'down', hp: { kind: 'rough', level: 'down' } });
    expect(snap.rows[2]).toMatchObject({
      current: true,
      /* 輪到地精 B（跳過倒下的 A）時持續回合減 1 */
      conds: [
        { label: '倒地', rounds: 1 },
        { label: '標記', rounds: null },
      ],
    });
    expect(JSON.stringify(snap)).not.toContain('GM 才看得到');
    expect(JSON.stringify(snap)).not.toContain('"ac"');
    const off = produce(d, (x) => {
      x.settings.playerHpEnemy = 'none';
      x.settings.playerHpParty = 'rough';
      x.settings.playerConds = false;
    });
    const s2 = playerSnapshot(off);
    expect(s2.rows[1].hp).toBeNull();
    expect(s2.rows[0].hp).toEqual({ kind: 'rough', level: 'full' });
    expect(s2.rows[2].conds).toEqual([]);
    /* 關掉 5e 的狀態時只送自訂的 */
    const noSrd = produce(d, (x) => {
      x.settings.srdConds = false;
    });
    expect(playerSnapshot(noSrd).rows[2].conds).toEqual([{ label: '標記', rounds: null }]);
  });

  it('存檔的整理：往返相同；壞掉的參戰者、狀態、重複的 id 與看不懂的設定用預設值', () => {
    const d = party();
    expect(sanitizeData(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(sanitizeData(null)).toBeNull();
    expect(sanitizeData({ list: 'x' })).toBeNull();
    const raw = {
      list: [
        { name: '甲', id: 'same', hp: 99, maxHp: 10, conds: [{ kind: 'srd', key: 'nope' }, 5] },
        { name: '乙', id: 'same', side: 'boss', init: 1e9 },
        { name: '   ' },
        'x',
      ],
      turn: 'missing',
      round: -3,
      settings: { initDie: 'd100', skipDown: 'yes', lockOrder: true },
      customConds: ['祝福', '祝福', '  ', 3, '長'.repeat(30)],
    };
    const s = sanitizeData(raw) as CombatData;
    expect(s.list.map((c) => [c.name, c.side, c.hp, c.init, c.conds.length])).toEqual([
      ['甲', 'enemy', 10, null, 0],
      ['乙', 'enemy', null, 99, 0],
    ]);
    expect(s.list[0].id).toBe('same');
    expect(s.list[1].id).not.toBe('same');
    expect(s.turn).toBeNull();
    expect(s.round).toBe(1);
    expect(s.settings).toMatchObject({ initDie: 'd20', skipDown: true, lockOrder: true });
    expect(s.customConds).toEqual(['祝福', '長'.repeat(20)]);
  });

  it('原作的 JSON：讀（加在後面、排序）、寫（原作的欄位與檔名）、壞檔的訊息', () => {
    const json = JSON.stringify({
      combatants: [
        { id: 1, name: 'Goblin A', initiative: 14, maxHp: 7, currentHp: 3, ac: 15 },
        { id: 2, name: 'Wolf', initiative: 18, maxHp: null, currentHp: null, ac: null },
      ],
      currentTurnIndex: 0,
    });
    const list = parseOriginalJson(json);
    expect(list.map((c) => [c.name, c.init, c.hp, c.maxHp, c.ac, c.side])).toEqual([
      ['Goblin A', 14, 3, 7, 15, 'enemy'],
      ['Wolf', 18, null, null, null, 'enemy'],
    ]);
    const d = party();
    appendCombatants(d, list);
    expect(names(d)).toEqual(['Wolf', '艾琳', 'Goblin A', '地精 A', '地精 B', '伏兵']);
    expect(() => parseOriginalJson('{')).toThrow(OriginalJsonError);
    expect(() => parseOriginalJson('{"x":1}')).toThrow('combatants');
    expect(() =>
      parseOriginalJson('{"combatants":[{"name":"a","initiative":"3","id":1}]}'),
    ).toThrow(OriginalJsonError);
    const now = new Date('2026-11-06T04:05:06.789Z');
    const out = JSON.parse(originalJson(party(), now));
    expect(out.currentTurnIndex).toBe(2);
    expect(out.exportDate).toBe('2026-11-06T04:05:06.789Z');
    expect(out.combatants[0]).toEqual({
      id: now.getTime(),
      name: '艾琳',
      initiative: 17,
      maxHp: 24,
      currentHp: 24,
      ac: null,
      originalMonsterName: '艾琳',
      monsterSource: null,
    });
    expect(out.combatants[2].originalMonsterName).toBe('地精');
    /* 原作讀得進去：每一位都有 name、數字的 initiative、id */
    expect(parseOriginalJson(originalJson(party(), now))).toHaveLength(4);
    expect(originalJsonName(now)).toBe('combat_2026-11-06T04-05-06.json');
  });
});
