/**
 * 奇幻隨機產生器的邏輯：鎖定後再產生（鎖住的留在原位）、重抽一張與一欄、複製與匯出的文字、CCFOLIA 棋子、
 * 存讀往返（自動存檔、專案檔）與讀回時的整理、自訂產生器。
 */
import { describe, expect, it } from 'vitest';
import { parseCharacterClipboard } from '@/ccfolia/characterData';
import { parseCsv } from '@/core/csv';
import { seededRandom } from '@/core/names';
import type { CorpusData } from '@/core/names/corpus';
import * as fantasyCorpus from '@/core/names/inknomu/inknomu-fantasy';
import { parseProject, serializeProject } from '@/core/storage';
import { partsText } from '@/tools/fantasy-gen/engine';
import { customGenerator, type GenEnv, generatorById } from '@/tools/fantasy-gen/generators';
import {
  batchText,
  cardFields,
  ccfoliaCharacter,
  csvText,
  DATA_VERSION,
  exportFileName,
  fantasyNames,
  findGenerator,
  type GenState,
  generateBatch,
  HISTORY_MAX,
  initialState,
  namelessFields,
  optionsLabel,
  partLines,
  pushHistory,
  rerollCard,
  rerollField,
  sanitizeHistory,
  sanitizeState,
  TOOL_ID,
} from '@/tools/fantasy-gen/logic';
import { S } from '@/tools/fantasy-gen/strings';

const corpus: CorpusData = { region: 'fantasy', packs: fantasyCorpus.PACKS };
const env: GenEnv = { names: fantasyNames(corpus) };
const npc = generatorById('npc')!;

describe('一批', () => {
  it('鎖住整張的卡留在原位，其他用同一個種子重抽；數量變少時後面的鎖定卡接在最後', () => {
    const first = generateBatch({ def: npc, options: {}, env, count: 5, seed: 'a' });
    const locked = first.results.map((c, i) => (i === 1 || i === 4 ? { ...c, locked: true } : c));
    const next = generateBatch({
      def: npc,
      options: {},
      env,
      count: 3,
      seed: 'b',
      current: locked,
    });
    expect(next.results).toHaveLength(4);
    expect(next.results[1]).toBe(locked[1]);
    expect(next.results[3]).toBe(locked[4]);
    /* 同樣的鎖定與種子 → 同樣的結果 */
    const again = generateBatch({
      def: npc,
      options: {},
      env,
      count: 3,
      seed: 'b',
      current: locked,
    });
    expect(again.results.map((c) => c.parts)).toEqual(next.results.map((c) => c.parts));
  });

  it('數量限制在 1～50', () => {
    expect(generateBatch({ def: npc, options: {}, env, count: 0, seed: 'x' }).results).toHaveLength(
      1,
    );
    expect(
      generateBatch({ def: npc, options: {}, env, count: 99, seed: 'x' }).results,
    ).toHaveLength(50);
  });
});

describe('重抽', () => {
  const card = generateBatch({ def: npc, options: {}, env, count: 1, seed: 'card' }).results[0];

  it('重抽一欄：只有那一欄換掉', () => {
    let changed = false;
    for (let i = 0; i < 10 && !changed; i++) {
      const next = rerollField(card, '目標', npc, {}, env, seededRandom(`f${i}`));
      const before = Object.fromEntries(
        cardFields(card.parts).map((f) => [f.key, card.parts.find((p) => p.k === f.key)!.t]),
      );
      const after = Object.fromEntries(
        cardFields(next.parts).map((f) => [f.key, next.parts.find((p) => p.k === f.key)!.t]),
      );
      for (const k of Object.keys(before)) if (k !== '目標') expect(after[k]).toBe(before[k]);
      changed = after.目標 !== before.目標;
    }
    expect(changed).toBe(true);
  });

  it('重抽一張：鎖定的欄留著', () => {
    const lockedCard = { ...card, lockedFields: ['名字', '種族'] };
    const next = rerollCard(lockedCard, npc, {}, env, seededRandom('again'));
    const value = (c: typeof card, k: string) => c.parts.find((p) => p.k === k)!.t;
    expect(value(next, '名字')).toBe(value(card, '名字'));
    expect(value(next, '種族')).toBe(value(card, '種族'));
    expect(partsText(next.parts)).not.toBe(partsText(card.parts));
  });
});

describe('文字', () => {
  it('一批的文字：一行一筆；一大塊的（寶藏）之間空一行', () => {
    const a = { parts: [{ t: '甲' }] };
    const b = { parts: [{ t: '乙' }] };
    expect(batchText([a, b])).toBe('甲\n乙');
    expect(batchText([{ parts: [{ t: '丙\n丁' }] }, b])).toBe('丙\n丁\n\n乙');
  });

  it('畫面的行：去掉空行與頭尾空白，欄的值有好幾行時每一行都是那個欄，第一個字母大寫', () => {
    const lines = partLines([
      { t: 'oak ' },
      { t: '\n' },
      { t: '甲\n乙', k: 'm', l: '魔法物品' },
      { t: '\n\n' },
    ]);
    expect(lines).toEqual([
      [{ t: 'Oak' }],
      [{ t: '甲', k: 'm', l: '魔法物品' }],
      [{ t: '乙', k: 'm', l: '魔法物品' }],
    ]);
  });

  it('CCFOLIA 棋子：名稱是名字那一欄，全文在備註；沒有名字欄的用產生器名稱', () => {
    const card = generateBatch({ def: npc, options: {}, env, count: 1, seed: 'cc' }).results[0];
    const r = parseCharacterClipboard(ccfoliaCharacter(card, npc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.character.name).toBe(card.parts.find((p) => p.l === '名字')!.t);
    expect(r.character.memo).toBe(partsText(card.parts));
    const trap = generatorById('trap')!;
    const t = generateBatch({ def: trap, options: {}, env, count: 1, seed: 'cc' }).results[0];
    const r2 = parseCharacterClipboard(ccfoliaCharacter(t, trap));
    expect(r2.ok && r2.character.name).toBe('陷阱');
  });

  it('CSV：產生器、全文、每一欄（照第一次出現的順序）', () => {
    const cards = generateBatch({ def: npc, options: {}, env, count: 2, seed: 'csv' }).results;
    const rows = parseCsv(
      csvText(cards, () => 'NPC')
        .replace(/^﻿/, '')
        .replace(/\r\n/g, '\n'),
    );
    expect(rows[0]).toEqual([
      '產生器',
      '全文',
      '名字',
      '個性',
      '種族',
      '身分',
      '特徵',
      '穿著',
      '目標',
    ]);
    expect(rows[1][0]).toBe('NPC');
    expect(rows[1][1]).toBe(partsText(cards[0].parts));
  });

  it('檔名與條件的文字', () => {
    expect(exportFileName('寶藏（Lazy 5e）', 'txt', new Date(2026, 10, 6, 9, 5))).toBe(
      '奇幻隨機產生器_寶藏（Lazy_5e）_20261106-0905.txt',
    );
    const treasure = generatorById('treasure')!;
    expect(optionsLabel(treasure, { tier: 'tier3' })).toBe(
      '11～16 級・SRD 5.2（2024 年版）・加一個遺物',
    );
  });
});

describe('存讀往返', () => {
  const state: GenState = {
    ...initialState,
    gen: 'treasure',
    options: { treasure: { tier: 'tier2' } },
    counts: { npc: 5 },
    seed: 's',
    lastSeed: 's',
    results: generateBatch({ def: npc, options: {}, env, count: 3, seed: 'r' }).results.map(
      (c, i) => (i === 0 ? { ...c, locked: true, lockedFields: ['名字'] } : c),
    ),
    saved: [
      {
        id: 'saved-1',
        gen: 'npc',
        label: 'NPC',
        parts: [{ t: '甲', k: '名字', l: '名字' }],
        at: 1,
      },
    ],
    customs: [{ id: 'c1', name: '傳聞', text: '範本\n  {a}\na\n  x\n' }],
  };

  it('自動存檔（JSON）與專案檔讀回來相同', () => {
    expect(sanitizeState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    const file = serializeProject(TOOL_ID, DATA_VERSION, state);
    expect(sanitizeState(parseProject(file, TOOL_ID).data)).toEqual(state);
  });

  it('讀回時整理：型別不符用預設、空的卡丟掉、鎖定的欄只留存在的、重複的 id 改掉、找不到的產生器回到 NPC', () => {
    const messy = sanitizeState({
      gen: 'custom:gone',
      counts: { npc: 999, trap: 'x' },
      seed: 3,
      results: [
        {
          id: 'a',
          gen: 'npc',
          parts: [{ t: '甲', k: 'x', l: 'X' }],
          lockedFields: ['x', 'nope', 1],
          locked: 'yes',
        },
        { id: 'a', gen: 'npc', parts: [{ t: '乙' }] },
        { id: 'b', parts: [] },
        'bad',
      ],
      customs: [{ id: 'c 1!', name: '', text: 5 }],
    });
    expect(messy.gen).toBe('npc');
    expect(messy.counts).toEqual({ npc: 50 });
    expect(messy.seed).toBe('');
    expect(messy.results.map((r) => r.id)).toEqual(['a', 'a-1']);
    expect(messy.results[0].lockedFields).toEqual(['x']);
    expect(messy.results[0].locked).toBe(false);
    expect(messy.customs).toEqual([{ id: 'c1', name: S.custom.newName(1), text: '' }]);
    expect(sanitizeState(null)).toEqual(initialState);
  });

  it('結果讀回時最多 50 筆', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...state.results[1], id: `r${i}` }));
    expect(sanitizeState({ ...state, results: many }).results).toHaveLength(50);
  });

  it('名字是「（無名氏）」的卡（語料讀不到時產生的）：找得到名字那一欄，補上之後就沒有了', () => {
    const nameless = generateBatch({
      def: npc,
      options: {},
      env: { names: null },
      count: 3,
      seed: 'n',
    }).results;
    const st = { ...initialState, results: nameless };
    const found = namelessFields(st);
    expect(found.map((f) => f.key)).toEqual(['名字', '名字', '名字']);
    const fixed = found.map(({ card, key, def }) =>
      rerollField(card, key, def, {}, env, seededRandom('fix')),
    );
    expect(namelessFields({ ...st, results: fixed })).toEqual([]);
    expect(fixed.map((c) => partsText(c.parts).replace(/^.+?——/, ''))).toEqual(
      nameless.map((c) => partsText(c.parts).replace(/^.+?——/, '')),
    );
  });

  it('紀錄：最多 20 批，讀回時整理', () => {
    let history = sanitizeHistory(undefined);
    for (let i = 0; i < 25; i++)
      history = pushHistory(history, {
        id: `h${i}`,
        at: i,
        gen: 'npc',
        label: 'NPC',
        detail: '',
        seed: `s${i}`,
        results: [{ gen: 'npc', variant: 0, parts: [{ t: `${i}` }] }],
      });
    expect(history).toHaveLength(HISTORY_MAX);
    expect(history[0].id).toBe('h24');
    expect(sanitizeHistory(JSON.parse(JSON.stringify(history)))).toEqual(history);
    expect(sanitizeHistory([{ results: [] }, 'x'])).toEqual([]);
  });
});

describe('自訂產生器', () => {
  it('範本表是每一筆的樣子（範本或 template），其他是表；缺少範本時提示', () => {
    const def = customGenerator({
      id: 'c1',
      name: '我的',
      text: 'template\n  {@色:色}\n色\n  紅\n',
    });
    expect(def.id).toBe('custom:c1');
    const built = def.build({}, env);
    expect(built.templates).toHaveLength(1);
    expect(Object.keys(built.tables)).toEqual(['色']);
    const batch = generateBatch({ def, options: {}, env, count: 2, seed: 'x' });
    expect(batch.results.map((r) => partsText(r.parts))).toEqual(['紅', '紅']);
    const none = customGenerator({ id: 'c2', name: '空', text: '色\n  紅\n' }).build({}, env);
    expect(none.issues).toContain(S.custom.noTemplate);
    expect(
      generateBatch({
        def: customGenerator({ id: 'c2', name: '空', text: '' }),
        options: {},
        env,
        count: 1,
        seed: 'x',
      }).results[0].parts,
    ).toEqual([]);
  });

  it('範本最上層的 \\n 換行', () => {
    const def = customGenerator({
      id: 'c1',
      name: '我的',
      text: '範本\n  第一行\\n第二行<br>{@欄:x}\n',
    });
    expect(
      partsText(generateBatch({ def, options: {}, env, count: 1, seed: 'x' }).results[0].parts),
    ).toBe('第一行\n第二行\nx');
  });

  it('找不到的表在這一批的問題裡', () => {
    const def = customGenerator({ id: 'c1', name: '我的', text: '範本\n  {沒有}\n' });
    expect(generateBatch({ def, options: {}, env, count: 1, seed: 'x' }).issues).toEqual([
      '找不到表「沒有」。',
    ]);
  });

  it('findGenerator：內建、自訂、找不到', () => {
    const st = { customs: [{ id: 'c1', name: 'A', text: '' }] };
    expect(findGenerator(st, 'npc')?.label).toBe('NPC');
    expect(findGenerator(st, 'custom:c1')?.label).toBe('A');
    expect(findGenerator(st, 'custom:c9')).toBeUndefined();
  });
});
