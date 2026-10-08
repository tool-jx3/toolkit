/**
 * CoC 擲骰工具的純邏輯：紀錄文字、快速加骰（與舊版同一套規則）、傷害計算、舊紀錄搬移、專案檔。
 */
import { describe, expect, it } from 'vitest';
import { combinePercentile, fixedRandom, randomForFace, rollDiceExpression } from '@/core/coc';
import {
  addLogEntry,
  appendDamageLine,
  appendQuickDice,
  calculateDamage,
  clampBonus,
  customLogText,
  formatClock,
  judgedLevel,
  LOG_MAX,
  legacyLogEntries,
  parseArmor,
  parseSkill,
  readProject,
  sanitizeLog,
  sanitizeSettings,
  skillLogText,
} from '@/tools/coc-dice/logic';

/** 舊版加骰鈕的規則（coc7_dice.js；測試用的參考實作） */
function legacyAppend(value: string, diceType: string): string {
  const cur = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[＋]/g, '+')
    .replace(/[－−]/g, '-')
    .replace(/[ｄＤ]/g, 'D')
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  const parts = cur ? (cur.match(/([+-]?[^+-]+)/g) as string[]) : [];
  const lastPart = parts.length ? parts[parts.length - 1] : '';
  const matchDice = lastPart.match(/^([+-]?)(\d+)?D(\d+)$/i);
  const matchBtnD = diceType.match(/^(\d+)?D(\d+)$/i);
  if (matchDice && matchBtnD) {
    const sign = matchDice[1] || '+';
    const num = Number.parseInt(matchDice[2] || '1', 10);
    const sides = matchDice[3];
    const btnNum = Number.parseInt(matchBtnD[1] || '1', 10);
    if (sides === matchBtnD[2]) {
      parts[parts.length - 1] =
        sign === '-' ? `${lastPart}+${diceType}` : `${sign}${num + btnNum}D${sides}`;
      return parts.join('').replace(/^\+/, '');
    }
  }
  const matchNum = lastPart.match(/^([+-]?)(\d+)$/);
  const matchBtnN = diceType.match(/^(\d+)$/);
  if (matchNum && matchBtnN) {
    const sign = matchNum[1] || '+';
    const num = Number.parseInt(matchNum[2], 10);
    const btnV = Number.parseInt(matchBtnN[1], 10);
    parts[parts.length - 1] = sign === '-' ? `${lastPart}+${diceType}` : `${sign}${num + btnV}`;
    return parts.join('').replace(/^\+/, '');
  }
  if (cur) return cur + (/^[+-]/.test(diceType) ? '' : '+') + diceType;
  return diceType.replace(/^\+/, '');
}

describe('快速加骰', () => {
  it('合併同面數、整數相加、減號不合併', () => {
    expect(appendQuickDice('', '1D6')).toBe('1D6');
    expect(appendQuickDice('1D6', '1D6')).toBe('2D6');
    expect(appendQuickDice('2D6', '1')).toBe('2D6+1');
    expect(appendQuickDice('2D6+1', '1')).toBe('2D6+2');
    expect(appendQuickDice('1D6-1D4', '1D4')).toBe('1D6-1D4+1D4');
    expect(appendQuickDice('1D6-2', '1')).toBe('1D6-2+1');
    expect(appendQuickDice('d6', '1D6')).toBe('2D6');
    expect(appendQuickDice('１ｄ８ ＋ ３', '1D8')).toBe('1D8+3+1D8');
    expect(appendQuickDice('', '1')).toBe('1');
  });

  it('與舊版的規則逐一相同', () => {
    const starts = [
      '',
      '1D6',
      '2d6',
      '1D6+1D4',
      '1D6-1D4',
      '3',
      '1D6-3',
      '１Ｄ１０＋２',
      'D20',
      '1D06',
      '5-',
    ];
    const tokens = ['1', '1D3', '1D4', '1D6', '1D8', '1D10', '1D12', '1D20', '1D100'];
    for (const s of starts) {
      for (const t of tokens) {
        let a = s;
        let b = s;
        /* 連按三次 */
        for (let i = 0; i < 3; i++) {
          a = appendQuickDice(a, t);
          b = legacyAppend(b, t);
          expect(a, `${s} + ${t} ×${i + 1}`).toBe(b);
        }
      }
    }
  });
});

describe('紀錄文字', () => {
  it('技能檢定', () => {
    const roll = combinePercentile(3, [80, 10], 1);
    expect(skillLogText(roll, 50, judgedLevel(roll, 50))).toBe(
      '技能值[50] BD/PD[1] ＞ 83, 13 ＞ 13 ＞ 困難成功',
    );
    const plain = combinePercentile(5, [40], 0);
    expect(skillLogText(plain, null, judgedLevel(plain, null))).toBe(
      '技能值[] BD/PD[0] ＞ 45 ＞ 45',
    );
    /* 技能值 0：寫進紀錄但不判定（舊版） */
    expect(skillLogText(plain, 0, judgedLevel(plain, 0))).toBe('技能值[0] BD/PD[0] ＞ 45 ＞ 45');
    expect(skillLogText(combinePercentile(0, [0, 30], -1), 70, 'fumble')).toBe(
      '技能值[70] BD/PD[-1] ＞ 100, 30 ＞ 100 ＞ 大失敗',
    );
  });

  it('自訂擲骰（算式是正規化後的寫法）', () => {
    const r = rollDiceExpression('１ｄ６ ＋ ２', fixedRandom([randomForFace(3, 6)]));
    if (!r.ok) throw new Error('應該是合法的算式');
    expect(customLogText(r.normalized, r)).toBe('1D6+2 ＞ 1D6[3]+2 ＞ 5');
    const lower = rollDiceExpression('2d4-1', fixedRandom([0, 0.99]));
    if (!lower.ok) throw new Error('應該是合法的算式');
    expect(customLogText(lower.normalized, lower)).toBe('2d4-1 ＞ 2D4[1,4]-1 ＞ 4');
  });

  it('技能值欄的解讀（parseInt）', () => {
    expect(parseSkill('')).toBeNull();
    expect(parseSkill('55')).toBe(55);
    expect(parseSkill('55.9')).toBe(55);
    expect(parseSkill('.5')).toBeNull();
    expect(clampBonus(5)).toBe(2);
    expect(clampBonus(-3)).toBe(-2);
    expect(clampBonus(Number.NaN)).toBe(0);
  });

  it('紀錄：新的在上面、最多 200 筆；時間 24 小時制', () => {
    let list = Array.from({ length: LOG_MAX }, (_, i) => ({ id: `${i}`, time: '', text: `${i}` }));
    list = addLogEntry(list, { id: 'n', time: '', text: 'new' });
    expect(list).toHaveLength(LOG_MAX);
    expect(list[0].text).toBe('new');
    expect(list[LOG_MAX - 1].text).toBe(`${LOG_MAX - 2}`);
    expect(formatClock(new Date(2026, 0, 1, 9, 5, 7))).toBe('09:05:07');
    expect(formatClock(new Date(2026, 0, 1, 21, 45, 0))).toBe('21:45:00');
  });

  it('舊版紀錄的搬移與整理', () => {
    expect(legacyLogEntries(null)).toBeNull();
    expect(legacyLogEntries('{')).toBeNull();
    expect(legacyLogEntries('{"a":1}')).toBeNull();
    const list = legacyLogEntries(
      JSON.stringify([{ time: '下午3:04:05', text: 'A' }, { text: 'B' }, { time: 'x' }, 5]),
    );
    expect(list?.map((e) => [e.time, e.text])).toEqual([
      ['下午3:04:05', 'A'],
      ['', 'B'],
    ]);
    expect(list?.every((e) => e.id)).toBe(true);
    expect(sanitizeLog(Array.from({ length: 250 }, (_, i) => ({ text: `${i}` })))).toHaveLength(
      LOG_MAX,
    );
  });
});

describe('傷害計算', () => {
  const SAMPLE = '(1D10+2) ＞ 3[3]+2 ＞ 5\n(1D10+2) ＞ 7[7]+2 ＞ 9\n(1D10+2) ＞ 4[4]+2 ＞ 6';

  it('扣護甲加總、指令', () => {
    expect(calculateDamage('0', SAMPLE)).toMatchObject({ ok: true, total: 20, command: ':HP-20' });
    expect(calculateDamage('2', SAMPLE)).toMatchObject({
      ok: true,
      values: [5, 9, 6],
      each: [3, 7, 4],
      total: 14,
    });
    expect(calculateDamage('10', SAMPLE)).toMatchObject({ ok: true, total: 0, command: ':HP-0' });
    expect(calculateDamage('-1', SAMPLE)).toMatchObject({ ok: true, total: 23 });
  });

  it('錯誤：先檢查護甲，再找結果', () => {
    expect(calculateDamage('', SAMPLE)).toEqual({ ok: false, error: 'armor' });
    expect(calculateDamage('', '')).toEqual({ ok: false, error: 'armor' });
    expect(calculateDamage('0', '沒有')).toEqual({ ok: false, error: 'no-rolls' });
    expect(parseArmor('1.9')).toBe(1);
    expect(parseArmor('3e1')).toBe(3);
  });

  it('帶入傷害計算：接在最後一行', () => {
    expect(appendDamageLine('', 'A')).toBe('A');
    expect(appendDamageLine('X', 'A')).toBe('X\nA');
    expect(appendDamageLine('X\n', 'A')).toBe('X\nA');
  });
});

describe('設定與專案檔', () => {
  it('整理設定', () => {
    expect(sanitizeSettings({ skill: 50, bonus: 9, expr: '1D6' })).toEqual({
      skill: '',
      bonus: 2,
      expr: '1D6',
      armor: '0',
      damageText: '',
    });
    expect(sanitizeSettings(null).bonus).toBe(0);
  });

  it('專案檔', () => {
    expect(readProject(null)).toBeNull();
    expect(readProject({ settings: {} })).toBeNull();
    const p = readProject({ settings: { skill: '60' }, log: [{ text: 'A', time: '1' }] });
    expect(p?.settings.skill).toBe('60');
    expect(p?.log[0]).toMatchObject({ text: 'A', time: '1' });
  });
});
