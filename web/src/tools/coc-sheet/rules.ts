/**
 * 角色卡的自動計算（規格 3.2）：技能值、困難／極限、HP／MP／SAN、移動力、DB／體格、技能點數。
 * 規則在共用的 `@/core/coc`；這裡把角色卡的欄位接上去，並決定「空白＝自動」的值。
 */
import {
  damageBonus7,
  movementRate7,
  parseAge,
  sanityMax,
  skillPointBudgets,
  skillThresholds,
} from '@/core/coc';
import type { Sheet, Skill, SkillBase, StatKey, Weapon } from './model';
import { SHEET } from './strings';

const has = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** 一般值的困難／極限（舊版的規則：值是 0 或空白時困難、極限留白） */
export function thresholds(value: number | null): { hard: number | null; extreme: number | null } {
  if (!has(value) || value <= 0) return { hard: null, extreme: null };
  const t = skillThresholds(value);
  return { hard: t.hard, extreme: t.extreme };
}

/** 初始值（DEX÷2 與 EDU 依屬性算；屬性空白時 null） */
export function baseValue(base: SkillBase, stats: Sheet['stats']): number | null {
  if (base === 'DEX/2') return has(stats.DEX) ? Math.floor(stats.DEX / 2) : null;
  if (base === 'EDU') return has(stats.EDU) ? stats.EDU : null;
  return has(base) ? base : null;
}

/** 初始值在角色卡上的寫法（15 →「15%」、DEX÷2 →「DEX×½」、EDU →「EDU%」、沒有 → 空字串） */
export function baseLabel(base: SkillBase): string {
  if (base === 'DEX/2') return SHEET.baseDexHalf;
  if (base === 'EDU') return SHEET.baseEdu;
  return has(base) ? `${base}%` : '';
}

/** 自動的技能值：初始＋職業＋興趣＋成長（都空白、初始也沒有時 null） */
export function autoSkillValue(skill: Skill, stats: Sheet['stats']): number | null {
  const b = baseValue(skill.base, stats);
  const parts = [skill.occupation, skill.interest, skill.growth];
  if (b === null && !parts.some(has)) return null;
  return (b ?? 0) + parts.reduce<number>((sum, v) => sum + (has(v) ? v : 0), 0);
}

/** 技能值（直接填的優先） */
export function skillValue(skill: Skill, stats: Sheet['stats']): number | null {
  return has(skill.value) ? skill.value : autoSkillValue(skill, stats);
}

/** 依鍵找預設技能（例如閃避、克蘇魯神話） */
export function skillByKey(sheet: Sheet, key: string): Skill | undefined {
  return sheet.skills.find((s) => s.key === key);
}

/** 技能在清單、CCFOLIA 指令裡的名稱：有專長的寫成「科學（化學）」 */
export function skillDisplayName(skill: Skill): string {
  const name = skill.name.trim();
  const sp = skill.specialty.trim();
  if (skill.kind === 'specialty' && sp) return name ? `${name}（${sp}）` : sp;
  return name;
}

export interface Derived {
  hpMax: number | null;
  mpMax: number | null;
  sanStart: number | null;
  sanMax: number | null;
  mov: number | null;
  db: string | null;
  build: number | null;
  dodge: number | null;
  budget: { occupation: number | null; interest: number | null };
}

/** 自動算出的值（不看手動填的欄位） */
export function autoDerived(sheet: Sheet): Derived {
  const s = sheet.stats;
  const mythos = skillByKey(sheet, 'cthulhuMythos');
  const dodge = skillByKey(sheet, 'dodge');
  const dbBuild = has(s.STR) && has(s.SIZ) ? damageBonus7(s.STR + s.SIZ) : null;
  return {
    hpMax: has(s.CON) && has(s.SIZ) ? Math.floor((s.CON + s.SIZ) / 10) : null,
    mpMax: has(s.POW) ? Math.floor(s.POW / 5) : null,
    sanStart: has(s.POW) ? s.POW : null,
    sanMax: sanityMax(mythos ? skillValue(mythos, s) : 0),
    mov: movementRate7({ STR: s.STR, DEX: s.DEX, SIZ: s.SIZ, age: parseAge(sheet.info.age) }),
    db: dbBuild ? dbBuild.db : null,
    build: dbBuild ? dbBuild.build : null,
    dodge: dodge ? skillValue(dodge, s) : null,
    budget: skillPointBudgets({ EDU: s.EDU, INT: s.INT }),
  };
}

/** 實際使用的值（手動填的優先） */
export function derived(sheet: Sheet): Derived {
  const a = autoDerived(sheet);
  return {
    hpMax: sheet.hp.max ?? a.hpMax,
    mpMax: sheet.mp.max ?? a.mpMax,
    sanStart: sheet.san.start ?? a.sanStart,
    sanMax: sheet.san.max ?? a.sanMax,
    mov: sheet.mov ?? a.mov,
    db: sheet.db.trim() ? sheet.db.trim() : a.db,
    build: sheet.build ?? a.build,
    dodge: a.dodge,
    budget: {
      occupation: sheet.budget.occupation ?? a.budget.occupation,
      interest: sheet.budget.interest ?? a.budget.interest,
    },
  };
}

/** 已分配的技能點數 */
export function usedPoints(sheet: Sheet): { occupation: number; interest: number } {
  let occupation = 0;
  let interest = 0;
  for (const s of sheet.skills) {
    if (has(s.occupation)) occupation += s.occupation;
    if (has(s.interest)) interest += s.interest;
  }
  return { occupation, interest };
}

/** 武器的技能值：使用的技能（找得到時）→ 直接填的值 */
export function weaponValue(weapon: Weapon, sheet: Sheet): number | null {
  if (weapon.skillId) {
    const skill = sheet.skills.find((s) => s.id === weapon.skillId);
    if (skill) return skillValue(skill, sheet.stats);
  }
  return has(weapon.value) ? weapon.value : null;
}

/** 屬性的值 */
export const statValue = (sheet: Sheet, key: StatKey): number | null => sheet.stats[key];
