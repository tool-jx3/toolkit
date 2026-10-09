/**
 * coc-sheet 的純邏輯：預設技能表、自動計算（技能值、HP／MP／SAN、移動力、DB／體格、技能點數）、
 * 存檔與專案檔的整理、CCFOLIA 角色 JSON 與聊天面板、檔名。共用的 7 版調查員規則（@/core/coc）也在這裡測。
 */
import { describe, expect, it } from 'vitest';
import { parseCharacterClipboard } from '@/ccfolia';
import {
  ageMovePenalty,
  movementRate7,
  parseAge,
  sanityMax,
  skillPointBudgets,
  skillThresholds,
} from '@/core/coc';
import {
  currentSheet,
  defaultSkills,
  duplicateSheet,
  newSheet,
  newSkill,
  readProject,
  type Sheet,
  SKILL_CATALOG,
  SKILL_SLOTS,
  sanitizeData,
  sanitizeSheet,
  sheetLabel,
} from '@/tools/coc-sheet/model';
import {
  ccfoliaData,
  ccfoliaJson,
  chatPalette,
  damageCommand,
  outputTitle,
  pngFileName,
} from '@/tools/coc-sheet/output';
import {
  autoDerived,
  autoSkillValue,
  baseLabel,
  derived,
  skillDisplayName,
  skillValue,
  thresholds,
  usedPoints,
  weaponValue,
} from '@/tools/coc-sheet/rules';

/** 林子安：STR 50 DEX 65 INT 70 CON 55 APP 45 POW 60 SIZ 70 EDU 80，42 歲 */
function sample(): Sheet {
  const s = newSheet('測試');
  s.info.name = '林子安';
  s.info.age = '42 歲';
  s.info.occupation = '私家偵探';
  Object.assign(s.stats, {
    STR: 50,
    DEX: 65,
    INT: 70,
    CON: 55,
    APP: 45,
    POW: 60,
    SIZ: 70,
    EDU: 80,
  });
  s.luck = 55;
  return s;
}

const byKey = (s: Sheet, key: string) => {
  const k = s.skills.find((x) => x.key === key);
  if (!k) throw new Error(key);
  return k;
};

describe('@/core/coc：7 版調查員', () => {
  it('困難 ⌊÷2⌋、極限 ⌊÷5⌋', () => {
    expect(skillThresholds(55)).toEqual({ regular: 55, hard: 27, extreme: 11 });
    expect(skillThresholds(1)).toEqual({ regular: 1, hard: 0, extreme: 0 });
  });

  it('移動力：7／8／9 與年齡減值', () => {
    expect(movementRate7({ STR: 50, DEX: 65, SIZ: 70 })).toBe(7);
    expect(movementRate7({ STR: 80, DEX: 65, SIZ: 70 })).toBe(8);
    expect(movementRate7({ STR: 70, DEX: 70, SIZ: 70 })).toBe(8);
    expect(movementRate7({ STR: 80, DEX: 75, SIZ: 70 })).toBe(9);
    expect(movementRate7({ STR: 80, DEX: 75, SIZ: 70, age: 39 })).toBe(9);
    expect(movementRate7({ STR: 80, DEX: 75, SIZ: 70, age: 40 })).toBe(8);
    expect(movementRate7({ STR: 80, DEX: 75, SIZ: 70, age: 55 })).toBe(7);
    expect(movementRate7({ STR: 50, DEX: 65, SIZ: 70, age: 95 })).toBe(2);
    expect(movementRate7({ STR: 50, DEX: null, SIZ: 70 })).toBeNull();
    expect([39, 40, 49, 50, 60, 70, 80, 120].map(ageMovePenalty)).toEqual([0, 1, 1, 2, 3, 4, 5, 5]);
    expect(ageMovePenalty(null)).toBe(0);
  });

  it('理智上限、技能點數、年齡文字', () => {
    expect(sanityMax(0)).toBe(99);
    expect(sanityMax(3)).toBe(96);
    expect(sanityMax(120)).toBe(0);
    expect(sanityMax(null)).toBe(99);
    expect(skillPointBudgets({ EDU: 80, INT: 70 })).toEqual({ occupation: 320, interest: 140 });
    expect(skillPointBudgets({ EDU: null, INT: 70 })).toEqual({ occupation: null, interest: 140 });
    expect(parseAge('42')).toBe(42);
    expect(parseAge('42 歲')).toBe(42);
    expect(parseAge('４２')).toBe(42);
    expect(parseAge('不詳')).toBeNull();
  });
});

describe('預設的角色卡', () => {
  it('60 格技能（47 個預設技能＋13 個空白列）、第一把武器徒手連到格鬥（鬥毆）', () => {
    const s = newSheet();
    expect(s.title).toBe('新角色卡');
    expect(s.skills).toHaveLength(SKILL_SLOTS);
    expect(SKILL_CATALOG).toHaveLength(SKILL_SLOTS);
    expect(s.skills.filter((k) => k.kind === 'custom')).toHaveLength(13);
    expect(s.skills.filter((k) => k.kind === 'specialty').map((k) => k.name)).toEqual([
      '科學',
      '藝術／手藝',
      '生存',
      '駕駛',
      '外語',
      '母語',
    ]);
    expect(s.skills.filter((k) => !k.checkable).map((k) => k.name)).toEqual([
      '克蘇魯神話',
      '信用評級',
    ]);
    expect(s.skills.slice(0, 8).map((k) => `${k.name}${baseLabel(k.base)}`)).toEqual([
      '恐嚇15%',
      '話術5%',
      '醫學1%',
      '汽車駕駛20%',
      '急救30%',
      '神秘學5%',
      '潛行20%',
      '閃避DEX×½',
    ]);
    expect(s.weapons).toHaveLength(1);
    expect(s.weapons[0]).toMatchObject({
      name: '徒手',
      damage: '1D3 + DB',
      range: '─',
      attacks: '1',
    });
    expect(s.weapons[0].skillId).toBe(byKey(s, 'fightingBrawl').id);
    expect(s.custom.title).toBe('自訂');
    expect(new Set(defaultSkills().map((k) => k.id)).size).toBe(SKILL_SLOTS);
  });
});

describe('自動計算', () => {
  it('困難／極限：0 或空白時留白（舊版的規則）', () => {
    expect(thresholds(null)).toEqual({ hard: null, extreme: null });
    expect(thresholds(0)).toEqual({ hard: null, extreme: null });
    expect(thresholds(60)).toEqual({ hard: 30, extreme: 12 });
  });

  it('技能值＝初始＋職業＋興趣＋成長；直接填的優先；閃避 DEX÷2、母語 EDU', () => {
    const s = sample();
    const intimidate = byKey(s, 'intimidate');
    expect(skillValue(intimidate, s.stats)).toBe(15);
    intimidate.occupation = 30;
    intimidate.interest = 10;
    intimidate.growth = 4;
    expect(autoSkillValue(intimidate, s.stats)).toBe(59);
    intimidate.value = 70;
    expect(skillValue(intimidate, s.stats)).toBe(70);
    expect(skillValue(byKey(s, 'dodge'), s.stats)).toBe(32);
    expect(skillValue(byKey(s, 'ownLanguage'), s.stats)).toBe(80);
    s.stats.DEX = null;
    expect(skillValue(byKey(s, 'dodge'), s.stats)).toBeNull();
    /* 空白列：沒有初始值也沒有點數 → 空白；有點數 → 點數合計 */
    const blank = newSkill();
    expect(autoSkillValue(blank, s.stats)).toBeNull();
    blank.interest = 20;
    expect(autoSkillValue(blank, s.stats)).toBe(20);
  });

  it('HP、MP、初始理智、理智上限（99－克蘇魯神話）、移動力（含年齡）、DB／體格、技能點數', () => {
    const s = sample();
    byKey(s, 'cthulhuMythos').value = 3;
    expect(autoDerived(s)).toEqual({
      hpMax: 12,
      mpMax: 12,
      sanStart: 60,
      sanMax: 96,
      mov: 6,
      db: '0',
      build: 0,
      dodge: 32,
      budget: { occupation: 320, interest: 140 },
    });
    s.stats.STR = 80;
    expect(autoDerived(s)).toMatchObject({ db: '+1D4', build: 1 });
  });

  it('手動填的值優先（空白的 DB 用自動）', () => {
    const s = sample();
    s.hp.max = 15;
    s.mov = 9;
    s.db = ' +1D6 ';
    s.build = 2;
    s.san.start = 50;
    s.budget.occupation = 400;
    expect(derived(s)).toMatchObject({
      hpMax: 15,
      mov: 9,
      db: '+1D6',
      build: 2,
      sanStart: 50,
      budget: { occupation: 400, interest: 140 },
    });
    s.db = '  ';
    expect(derived(s).db).toBe('0');
  });

  it('屬性沒填時衍生值空白（理智上限照算 99）', () => {
    const d = autoDerived(newSheet());
    expect(d).toMatchObject({
      hpMax: null,
      mpMax: null,
      sanStart: null,
      sanMax: 99,
      mov: null,
      db: null,
      build: null,
      dodge: null,
    });
  });

  it('已用的技能點數；武器的技能值（使用的技能 → 直接填的值）', () => {
    const s = sample();
    byKey(s, 'spotHidden').occupation = 50;
    byKey(s, 'libraryUse').occupation = 40;
    byKey(s, 'listen').interest = 30;
    expect(usedPoints(s)).toEqual({ occupation: 90, interest: 30 });
    expect(weaponValue(s.weapons[0], s)).toBe(25);
    byKey(s, 'fightingBrawl').occupation = 30;
    expect(weaponValue(s.weapons[0], s)).toBe(55);
    s.weapons[0].skillId = null;
    expect(weaponValue(s.weapons[0], s)).toBeNull();
    s.weapons[0].value = 40;
    expect(weaponValue(s.weapons[0], s)).toBe(40);
    /* 連到的技能被刪掉：用直接填的值 */
    s.weapons[0].skillId = 'gone';
    expect(weaponValue(s.weapons[0], s)).toBe(40);
  });

  it('技能的顯示名稱：專長寫成「科學（化學）」', () => {
    const s = sample();
    const sci = byKey(s, 'science');
    expect(skillDisplayName(sci)).toBe('科學');
    sci.specialty = '化學';
    expect(skillDisplayName(sci)).toBe('科學（化學）');
  });
});

describe('存檔、專案檔的整理', () => {
  it('壞掉的欄位用預設值；id 重複時換新', () => {
    const s = sanitizeSheet({
      id: 'a',
      title: 5,
      stats: { STR: '50', DEX: 60 },
      skills: [{ kind: 'weird', name: 3, base: 'EDU', value: 'x' }, null],
      weapons: 'nope',
      portrait: { assetId: 'abc', crop: { x: 0, y: 0, width: 0, height: 10 } },
      custom: { text: 'x' },
    });
    expect(s.title).toBe('');
    expect(s.stats).toMatchObject({ STR: null, DEX: 60 });
    expect(s.skills).toHaveLength(2);
    expect(s.skills[0]).toMatchObject({
      kind: 'custom',
      name: '',
      base: 'EDU',
      value: null,
      checkable: true,
    });
    expect(s.weapons).toHaveLength(1);
    expect(s.portrait).toBeNull();
    expect(s.custom).toEqual({ title: '自訂', text: 'x' });
    const data = sanitizeData({ sheets: [{ id: 'x' }, { id: 'x' }] });
    expect(data?.sheets).toHaveLength(2);
    expect(data?.sheets[0].id).not.toBe(data?.sheets[1].id);
    expect(sanitizeData({ sheets: [] })).toBeNull();
    expect(sanitizeData(null)).toBeNull();
  });

  it('專案檔：目前的角色卡找不到時第一張；不能用時 null', () => {
    const a = newSheet('甲');
    const b = newSheet('乙');
    expect(readProject({ sheets: [a, b], currentId: b.id })?.currentId).toBe(b.id);
    expect(readProject({ sheets: [a, b], currentId: 'zzz' })?.currentId).toBe(a.id);
    expect(readProject({ foo: 1 })).toBeNull();
    expect(currentSheet({ sheets: [a, b] }, null)).toBe(a);
  });

  it('複製：新的 id、名稱加「（複本）」、內容相同（武器的技能連結不變）', () => {
    const a = sample();
    const c = duplicateSheet(a);
    expect(c.id).not.toBe(a.id);
    expect(c.title).toBe('測試（複本）');
    expect(c.weapons[0].skillId).toBe(a.weapons[0].skillId);
    expect(c.skills).toEqual(a.skills);
  });

  it('清單上的名稱：角色卡名稱 → 姓名 →「未命名的角色卡」', () => {
    const s = newSheet('');
    expect(sheetLabel(s)).toBe('未命名的角色卡');
    s.info.name = '林子安';
    expect(sheetLabel(s)).toBe('林子安');
    s.title = '主角';
    expect(sheetLabel(s)).toBe('主角');
  });
});

describe('CCFOLIA 角色資料', () => {
  function full() {
    const s = sample();
    byKey(s, 'spotHidden').occupation = 50;
    byKey(s, 'cthulhuMythos').value = 3;
    const sci = byKey(s, 'science');
    sci.specialty = '化學';
    sci.value = 31;
    s.hp.current = 10;
    s.weapons.push({
      id: 'w2',
      name: '手槍',
      skillId: byKey(s, 'firearmsHandgun').id,
      value: null,
      damage: '1D10',
      range: '15m',
      attacks: '1',
      ammo: '6',
      malfunction: '100',
    });
    return s;
  }

  it('剪貼簿 JSON：kind character、欄位順序、狀態、參數', () => {
    const json = ccfoliaJson(full());
    const parsed = JSON.parse(json);
    expect(parsed.kind).toBe('character');
    expect(Object.keys(parsed.data)).toEqual([
      'name',
      'initiative',
      'externalUrl',
      'status',
      'params',
      'commands',
      'memo',
    ]);
    expect(parsed.data.name).toBe('林子安');
    expect(parsed.data.initiative).toBe(65);
    expect(parsed.data.status).toEqual([
      { label: 'HP', value: 10, max: 12 },
      { label: 'MP', value: 12, max: 12 },
      { label: 'SAN', value: 60, max: 96 },
      { label: '幸運', value: 55, max: 55 },
    ]);
    expect(parsed.data.params).toEqual([
      { label: 'STR', value: '50' },
      { label: 'CON', value: '55' },
      { label: 'POW', value: '60' },
      { label: 'DEX', value: '65' },
      { label: 'APP', value: '45' },
      { label: 'SIZ', value: '70' },
      { label: 'INT', value: '70' },
      { label: 'EDU', value: '80' },
      { label: 'DB', value: '0' },
      { label: '體格', value: '0' },
      { label: 'MOV', value: '6' },
    ]);
    expect(parsed.data.memo).toBe('職業：私家偵探\n年齡：42 歲');
    expect(json).toContain('\n  "data": {');
    expect(parseCharacterClipboard(json).ok).toBe(true);
  });

  it('聊天面板', () => {
    const lines = chatPalette(full()).split('\n');
    expect(lines.slice(0, 4)).toEqual([
      'CC<={SAN} 理智檢定',
      'CC<={幸運} 幸運',
      'CC<=70 靈感',
      'CC<=80 知識',
    ]);
    expect(lines).toContain('CC<=50 STR');
    expect(lines).toContain('CC<=75 偵查');
    expect(lines).toContain('CC<=31 科學（化學）');
    expect(lines).toContain('CC<=3 克蘇魯神話');
    expect(lines).toContain('CC<=25 徒手');
    expect(lines).toContain('1D3+{DB} 徒手（傷害）');
    expect(lines).toContain('CC<=20 手槍');
    expect(lines).toContain('1D10 手槍（傷害）');
    expect(lines.slice(-11)).toEqual([
      '//DB=0',
      '//體格=0',
      '//MOV=6',
      '//STR=50',
      '//CON=55',
      '//POW=60',
      '//DEX=65',
      '//APP=45',
      '//SIZ=70',
      '//INT=70',
      '//EDU=80',
    ]);
    /* 空白列、名稱空白的技能不輸出 */
    expect(lines.some((l) => /^CC<=\d+ $/.test(l))).toBe(false);
  });

  it('沒填的屬性不輸出；名稱空白時「無名氏」', () => {
    const s = newSheet('');
    const d = ccfoliaData(s);
    expect(d.name).toBe('無名氏');
    expect(d.initiative).toBe(0);
    expect(
      chatPalette(s)
        .split('\n')
        .some((l) => l.startsWith('CC<=') && l.endsWith(' STR')),
    ).toBe(false);
  });

  it('傷害算式：拿掉空白、DB 換成 {DB}', () => {
    expect(damageCommand('1D3 + DB')).toBe('1D3+{DB}');
    expect(damageCommand('1d6+db')).toBe('1d6+{DB}');
    expect(damageCommand('DBX+1')).toBe('DBX+1');
    expect(damageCommand('2D6')).toBe('2D6');
  });
});

describe('檔名', () => {
  it('列印標題與 PNG 檔名：姓名 → 角色卡名稱 →「調查員角色卡」', () => {
    const s = newSheet('主角');
    expect(outputTitle(s)).toBe('主角');
    s.info.name = '林/子安';
    expect(outputTitle(s)).toBe('林/子安');
    expect(pngFileName(s, '1')).toBe('林_子安_角色卡_第1頁.png');
    expect(pngFileName(s, 'both')).toBe('林_子安_角色卡.png');
    expect(outputTitle(newSheet(''))).toBe('調查員角色卡');
  });
});
