/**
 * CoC NPC 產生器的純邏輯：與舊版逐字相同的 CCFOLIA 角色 JSON 與聊天面板、擲屬性、衍生值、舊存檔搬移、專案檔。
 * 舊版的預期輸出（tests/unit/fixtures/coc-npc-legacy.json）是在舊版頁面（tools/trpg-lab/coc_npc_token.html）
 * 把 Math.random 換成同一串亂數、照同樣的步驟操作後讀出來的。
 */
import { describe, expect, it } from 'vitest';
import { parseCharacterClipboard } from '@/ccfolia';
import { type Characteristic, fixedRandom, randomForFace } from '@/core/coc';
import {
  ccfoliaData,
  ccfoliaJson,
  chatPalette,
  currentNpc,
  diceError,
  fromLegacy,
  movLabel,
  movValue,
  type Npc,
  newNpc,
  readProject,
  recalc,
  replaceDb,
  rollAbility,
  rollAllAbilities,
  sanitizeNpc,
  sanitizeNpcData,
} from '@/tools/coc-npc/logic';
import legacy from './fixtures/coc-npc-legacy.json';

interface LegacyCase {
  input: {
    edition: 7 | 6;
    dice: Record<Characteristic, string>;
    name: string;
    skills: [string, string][];
    commands: [string, string][];
    memo: string;
    mov: string;
    sanOff?: boolean;
    ccb?: boolean;
  };
  json: string;
  palette: string;
}

/** 照舊版頁面上的操作順序做出同一個 NPC */
function build(c: LegacyCase['input']): Npc {
  let npc = newNpc(7);
  if (c.edition === 6) npc = recalc({ ...npc, edition: 6 });
  npc = {
    ...npc,
    name: c.name,
    abilities: Object.fromEntries(
      Object.entries(c.dice).map(([k, dice]) => [k, { dice, value: 0 }]),
    ) as Npc['abilities'],
    skills: c.skills.map(([name, value], i) => ({ id: `s${i}`, name, value: Number(value) })),
    commands: c.commands.map(([name, expr], i) => ({ id: `c${i}`, name, expr })),
    memo: c.memo,
    mov: c.mov,
    sanEnabled: !c.sanOff,
    commandType: c.ccb ? 'CCB' : 'CC',
  };
  return rollAllAbilities(npc, fixedRandom(legacy.seq)).npc;
}

describe('與舊版逐字相同的輸出（同一串亂數）', () => {
  for (const [id, raw] of Object.entries(legacy.cases)) {
    const c = raw as LegacyCase;
    it(id, () => {
      const npc = build(c.input);
      expect(ccfoliaJson(npc)).toBe(c.json);
      expect(chatPalette(npc)).toBe(c.palette);
      /* 輸出是合法的 CCFOLIA 角色剪貼簿 JSON */
      expect(parseCharacterClipboard(ccfoliaJson(npc)).ok).toBe(true);
    });
  }
});

describe('輸出細節', () => {
  it('JSON 的欄位與順序', () => {
    const npc = newNpc(7);
    const data = JSON.parse(ccfoliaJson(npc));
    expect(Object.keys(data)).toEqual(['kind', 'data']);
    expect(Object.keys(data.data)).toEqual([
      'name',
      'initiative',
      'externalUrl',
      'status',
      'params',
      'commands',
      'memo',
    ]);
    expect(data.data.params.map((p: { label: string }) => p.label)).toEqual([
      'STR',
      'CON',
      'POW',
      'DEX',
      'APP',
      'SIZ',
      'INT',
      'EDU',
      'DB',
      '體格',
    ]);
  });

  it('6 版：沒有體格；MOV 標籤是「移動力」；MOV 空白或讀不出數字時不輸出', () => {
    const npc = { ...newNpc(6), mov: '7' };
    const d = ccfoliaData(npc);
    expect(d.params?.map((p) => p.label)).toContain('移動力');
    expect(d.params?.map((p) => p.label)).not.toContain('體格');
    expect(chatPalette(npc)).toContain('//移動力=7');
    expect(movLabel(7)).toBe('MOV');
    expect(ccfoliaData({ ...npc, mov: '' }).params?.map((p) => p.label)).not.toContain('移動力');
    expect(movValue('8.5')).toBe(8);
    expect(movValue('')).toBeNull();
  });

  it('DB 空白時輸出 0；名稱空白時是「無名氏」；先攻是 DEX', () => {
    const base = newNpc(7);
    const npc = {
      ...base,
      name: '',
      db: '',
      abilities: { ...base.abilities, DEX: { dice: '', value: 55 } },
    };
    const d = ccfoliaData(npc);
    expect(d.name).toBe('無名氏');
    expect(d.initiative).toBe(55);
    expect(d.params?.find((p) => p.label === 'DB')?.value).toBe('0');
    expect(chatPalette(npc)).toContain('//DB=0');
  });

  it('指令：算式在前、名稱在後（5. D2）；DB 換成 {DB}', () => {
    const npc = {
      ...newNpc(7),
      commands: [
        { id: 'a', name: '拳擊', expr: '1D3+DB' },
        { id: 'b', name: '名稱但沒有算式', expr: '' },
        { id: 'c', name: '', expr: '1D4' },
      ],
    };
    const lines = chatPalette(npc).split('\n');
    expect(lines).toContain('1D3+{DB} 拳擊');
    expect(lines).toContain('1D4');
    expect(lines.join('\n')).not.toContain('名稱但沒有算式');
  });

  it('replaceDb：獨立的 DB（不分大小寫）與 {db}', () => {
    expect(replaceDb('1D6+DB')).toBe('1D6+{DB}');
    expect(replaceDb('1D6+db')).toBe('1D6+{DB}');
    expect(replaceDb('1D6+Db')).toBe('1D6+{DB}');
    expect(replaceDb('{db}+1')).toBe('{DB}+1');
    expect(replaceDb('{DB}')).toBe('{DB}');
    expect(replaceDb('DBX+1')).toBe('DBX+1');
    expect(replaceDb('ADB')).toBe('ADB');
    expect(replaceDb('DB_1')).toBe('DB_1');
    expect(replaceDb('1D6+DB+DB')).toBe('1D6+{DB}+{DB}');
  });

  it('6 版的檢定值 ×5、CC／CCB；SAN 關掉時不輸出', () => {
    const base = newNpc(6);
    const npc = {
      ...base,
      commandType: 'CCB' as const,
      abilities: { ...base.abilities, STR: { dice: '', value: 13 } },
      sanEnabled: false,
    };
    const p = chatPalette(npc);
    expect(p.split('\n')[0]).toBe('CCB<=65 STR');
    expect(p).not.toContain('理智檢定');
    expect(p).not.toContain('//SAN=');
    expect(ccfoliaData(npc).status?.map((s) => s.label)).toEqual(['HP', 'MP']);
    /* 7 版一律 CC */
    expect(chatPalette({ ...npc, edition: 7 }).split('\n')[0]).toBe('CC<=13 STR');
  });
});

describe('擲屬性與衍生值', () => {
  it('7 版 ×5、最少 0；空白不擲；看不懂的不擲並回報', () => {
    const base = newNpc(7);
    const npc: Npc = {
      ...base,
      abilities: {
        ...base.abilities,
        STR: { dice: '3D6', value: 0 },
        CON: { dice: '-1D6', value: 40 },
        POW: { dice: '(2D6+6)', value: 30 },
      },
    };
    const six = fixedRandom([randomForFace(6, 6)]);
    const r = rollAbility(npc, 'STR', six);
    expect(r.error).toBeNull();
    expect(r.npc.abilities.STR.value).toBe(90);
    /* 擲了就重算衍生值（CON 40 → HP 4） */
    expect(r.npc.hp).toBe(4);
    expect(rollAbility(npc, 'CON', six).npc.abilities.CON.value).toBe(0);
    const bad = rollAbility(npc, 'POW', six);
    expect(bad.error).toBe('syntax');
    expect(bad.npc).toBe(npc);
    expect(rollAbility(npc, 'DEX', six).npc).toBe(npc);
    const all = rollAllAbilities(npc, six);
    expect(all.errors).toEqual(['POW']);
    expect(all.npc.abilities.STR.value).toBe(90);
    expect(all.npc.abilities.POW.value).toBe(30);
    expect(diceError('(2D6+6)')).toBe('syntax');
    expect(diceError('')).toBeNull();
    expect(diceError('3d6')).toBeNull();
  });

  it('6 版不乘 5；改版本時重算衍生值、6 版保留原本的體格', () => {
    const base = newNpc(6);
    const r = rollAbility(
      { ...base, abilities: { ...base.abilities, SIZ: { dice: '2D6+6', value: 0 } } },
      'SIZ',
      fixedRandom([randomForFace(1, 6)]),
    );
    expect(r.npc.abilities.SIZ.value).toBe(8);
    const v7 = recalc({ ...r.npc, edition: 7, build: 5 });
    expect(v7.build).toBe(-2);
    const v6 = recalc({ ...v7, edition: 6, build: 5 });
    expect(v6.build).toBe(5);
    expect(v6.hp).toBe(4);
  });

  it('新的 NPC：衍生值都是 0、DB「0」（舊版不先算）', () => {
    const npc = newNpc(7);
    expect([npc.hp, npc.mp, npc.san, npc.build, npc.db]).toEqual([0, 0, 0, 0, '0']);
    expect(npc.name).toBe('新 NPC');
    expect(npc.skills).toHaveLength(1);
    expect(npc.commands).toHaveLength(1);
  });
});

describe('舊存檔與專案檔', () => {
  const LEGACY = {
    npcs: [
      {
        id: 'abc',
        version: '6',
        name: '舊的 NPC',
        externalUrl: 'https://example.com/sheet',
        abilities: { STR: { dice: '3D6', value: 12 }, CON: { dice: '', value: 9 } },
        hp: 10,
        mp: 8,
        san: 40,
        sanEnabled: false,
        db: '0',
        build: 0,
        mov: '7',
        skills: [{ name: '說服', value: 35 }],
        commands: [{ name: '', expr: '1D3+DB' }],
        commandType: 'CCB',
        memo: '備註',
      },
      { id: 'def', version: '7', name: '第二個' },
    ],
    currentId: 'def',
  };

  it('舊版 { npcs, currentId } → 新版；缺的欄位用預設值', () => {
    const r = fromLegacy(JSON.stringify(LEGACY));
    expect(r?.currentId).toBe('def');
    const [a, b] = r!.data.npcs;
    expect(a).toMatchObject({
      id: 'abc',
      edition: 6,
      name: '舊的 NPC',
      externalUrl: 'https://example.com/sheet',
      hp: 10,
      sanEnabled: false,
      mov: '7',
      commandType: 'CCB',
      memo: '備註',
    });
    expect(a.abilities.STR).toEqual({ dice: '3D6', value: 12 });
    expect(a.abilities.EDU).toEqual({ dice: '', value: 0 });
    expect(a.skills[0]).toMatchObject({ name: '說服', value: 35 });
    expect(a.skills[0].id).toBeTruthy();
    expect(ccfoliaData(a).externalUrl).toBe('https://example.com/sheet');
    expect(b).toMatchObject({ edition: 7, name: '第二個', sanEnabled: true, db: '0' });
    expect(currentNpc(r!.data, 'def').id).toBe('def');
    expect(currentNpc(r!.data, 'nope').id).toBe('abc');
  });

  it('壞掉的存檔', () => {
    expect(fromLegacy(null)).toBeNull();
    expect(fromLegacy('{')).toBeNull();
    expect(fromLegacy('[1]')).toBeNull();
    const empty = fromLegacy('{"npcs":[]}');
    expect(empty?.data.npcs).toHaveLength(1);
    expect(sanitizeNpcData({ npcs: 'x' })).toBeNull();
    const dup = sanitizeNpcData({ npcs: [{ id: 'x' }, { id: 'x' }] });
    expect(new Set(dup?.npcs.map((n) => n.id)).size).toBe(2);
    expect(sanitizeNpc({ mov: 9, hp: 'x', skills: [null] })).toMatchObject({
      mov: '9',
      hp: 0,
      skills: [{ name: '', value: 0 }],
    });
  });

  it('專案檔：整理內容、目前的 NPC 找不到時用第一個', () => {
    expect(readProject(null)).toBeNull();
    expect(readProject({ npcs: [{ id: 'a' }, { id: 'b' }], currentId: 'b' })?.currentId).toBe('b');
    expect(readProject({ npcs: [{ id: 'a' }], currentId: 'z' })?.currentId).toBe('a');
  });
});

describe('參照式聊天面板（2026-11-20，F38～F43）', () => {
  /** 7 版：屬性、技能（含同名、和屬性同名、有大括號、名稱空白）、指令（DB、屬性名稱、組合技能） */
  function sample(edition: 7 | 6 = 7): Npc {
    let npc: Npc = {
      ...newNpc(7),
      name: '測試',
      abilities: Object.fromEntries(
        (['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'] as const).map((k, i) => [
          k,
          { dice: '', value: (edition === 7 ? 50 : 10) + i },
        ]),
      ) as Npc['abilities'],
      skills: [
        { id: 'a', name: '偵查', value: 60 },
        { id: 'b', name: '偵查', value: 40 },
        { id: 'c', name: 'str', value: 1 },
        { id: 'd', name: '{x}', value: 2 },
        { id: 'e', name: ' 聆聽 ', value: 50 },
        { id: 'f', name: '', value: 9 },
      ],
      commands: [
        { id: 'x', name: '拳擊', expr: '1D3+DB' },
        { id: 'y', name: '', expr: '1D6+STR' },
        { id: 'z', name: '組合', expr: 'CBR({偵查},{聆聽})' },
      ],
      mov: '8',
      paletteRefs: true,
    };
    npc = recalc({ ...npc, edition });
    return npc;
  }

  it('沒開時（沒有這個欄位）輸出和以前一樣；整理時只有開的時候留下欄位', () => {
    const off = { ...sample() };
    delete off.paletteRefs;
    expect(chatPalette(off)).toContain('CC<=60 偵查');
    expect(chatPalette(off)).toContain('//STR=50');
    expect(chatPalette(off)).toContain('1D6+STR');
    expect('paletteRefs' in sanitizeNpc(off)).toBe(false);
    expect(sanitizeNpc({ ...off, paletteRefs: false }).paletteRefs).toBeUndefined();
    expect(sanitizeNpc({ ...off, paletteRefs: 'yes' }).paletteRefs).toBeUndefined();
    expect(sanitizeNpc(sample()).paletteRefs).toBe(true);
  });

  it('7 版的聊天面板：檢定用 {名稱}，不寫 //名稱=值；寫不進參數的技能照舊寫數字', () => {
    expect(chatPalette(sample())).toBe(
      [
        'CC<={SAN} 理智檢定',
        'CC<={STR} STR',
        'CC<={CON} CON',
        'CC<={POW} POW',
        'CC<={DEX} DEX',
        'CC<={APP} APP',
        'CC<={SIZ} SIZ',
        'CC<={INT} INT',
        'CC<={EDU} EDU',
        'CC<={偵查} 偵查',
        'CC<=40 偵查',
        'CC<=1 str',
        'CC<=2 {x}',
        'CC<={聆聽}  聆聽 ',
        '1D3+{DB} 拳擊',
        '1D6+{STR}',
        'CBR({偵查},{聆聽}) 組合',
      ].join('\n'),
    );
  });

  it('JSON：技能的成功率接在參數最後；狀態不變', () => {
    const d = ccfoliaData(sample());
    expect(d.params?.map((p) => `${p.label}=${p.value}`)).toEqual([
      'STR=50',
      'CON=51',
      'POW=52',
      'DEX=53',
      'APP=54',
      'SIZ=55',
      'INT=56',
      'EDU=57',
      `DB=${d.params?.[8].value}`,
      `體格=${d.params?.[9].value}`,
      'MOV=8',
      '偵查=60',
      '聆聽=50',
    ]);
    expect(d.status?.map((s) => s.label)).toEqual(['HP', 'MP', 'SAN']);
    expect(d.commands).toBe(chatPalette(sample()));
    expect(parseCharacterClipboard(ccfoliaJson(sample())).ok).toBe(true);
  });

  it('6 版：屬性 {STR}*5、CC／CCB；SAN 關掉時沒有理智檢定、算式裡的 SAN 不換', () => {
    const v6 = { ...sample(6), commandType: 'CCB' as const };
    const p = chatPalette(v6);
    expect(p.split('\n').slice(0, 3)).toEqual([
      'CCB<={SAN} 理智檢定',
      'CCB<={STR}*5 STR',
      'CCB<={CON}*5 CON',
    ]);
    expect(p).toContain('CCB<={偵查} 偵查');
    expect(ccfoliaData(v6).params?.map((x) => x.label)).toContain('移動力');
    const noSan = {
      ...sample(),
      sanEnabled: false,
      commands: [{ id: 'q', name: '', expr: '1D6+SAN+HP' }],
    };
    expect(chatPalette(noSan)).not.toContain('理智檢定');
    expect(chatPalette(noSan)).toContain('1D6+SAN+{HP}');
  });
});
