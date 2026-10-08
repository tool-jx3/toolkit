/**
 * CoC 擲骰工具的純邏輯（不依賴 React）：紀錄文字、快速加骰、傷害計算、舊存檔搬移、專案檔整理。
 * 規則照舊版 trpg-lab（coc7_dice.js、damage_sum.js），規格見 docs/refactor/specs/coc-dice.md。
 */
import {
  applyArmor,
  type DiceRollResult,
  formatDiceDetail,
  lineEndTotals,
  normalizeDiceText,
  type PercentileRoll,
  SUCCESS_LEVEL_LABELS,
  type SuccessLevel,
  splitDiceParts,
  statusChangeCommand,
  successLevel,
} from '@/core/coc';
import { S } from './strings';

export const TOOL_ID = 'coc-dice';
/** 舊版（trpg-lab 的 CoC 7 版擲骰工具）的擲骰紀錄（localStorage） */
export const LEGACY_LOG_KEY = 'iklab_coc7_dice_v1';
/** 紀錄最多保留的筆數 */
export const LOG_MAX = 200;
/** 獎勵骰／懲罰骰的範圍 */
export const BONUS_MIN = -2;
export const BONUS_MAX = 2;
/** 快速加骰的按鈕 */
export const QUICK_DICE = ['1', '1D3', '1D4', '1D6', '1D8', '1D10', '1D12', '1D20', '1D100'];

/* ---------- 設定 ---------- */

export interface DiceSettings {
  /** 技能值欄（原生數字欄的值字串，空白＝不判定） */
  skill: string;
  /** 獎勵骰（正）／懲罰骰（負），-2～2 */
  bonus: number;
  /** 自訂擲骰的算式 */
  expr: string;
  /** 護甲欄（原生數字欄的值字串） */
  armor: string;
  /** 傷害計算貼上的擲骰結果 */
  damageText: string;
}

export const DEFAULT_SETTINGS: DiceSettings = {
  skill: '',
  bonus: 0,
  expr: '',
  armor: '0',
  damageText: '',
};

export function clampBonus(v: number): number {
  return Number.isFinite(v) ? Math.max(BONUS_MIN, Math.min(BONUS_MAX, Math.trunc(v))) : 0;
}

/** 整理設定（讀專案檔、讀自動存檔時）：型別不符的欄位用預設值 */
export function sanitizeSettings(raw: unknown): DiceSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  return {
    skill: str(r.skill, DEFAULT_SETTINGS.skill),
    bonus: typeof r.bonus === 'number' ? clampBonus(r.bonus) : DEFAULT_SETTINGS.bonus,
    expr: str(r.expr, DEFAULT_SETTINGS.expr),
    armor: str(r.armor, DEFAULT_SETTINGS.armor),
    damageText: str(r.damageText, DEFAULT_SETTINGS.damageText),
  };
}

/* ---------- 技能檢定 ---------- */

/** 技能值欄的值：空白時 null；其他照舊版以 parseInt 取整數（讀不出數字時也當成沒填） */
export function parseSkill(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/** 要不要判定成功等級（舊版：技能值不是 0 才判定） */
export function judgedLevel(roll: PercentileRoll, skill: number | null): SuccessLevel | null {
  return skill ? successLevel(roll.result, skill) : null;
}

/** 技能檢定的紀錄：「技能值[50] BD/PD[1] ＞ 83, 13 ＞ 13 ＞ 極限成功」 */
export function skillLogText(
  roll: PercentileRoll,
  skill: number | null,
  level: SuccessLevel | null,
): string {
  const head = `${S.log.skillPrefix}[${skill ?? ''}] BD/PD[${roll.bonus}]`;
  const tail = level ? ` ＞ ${SUCCESS_LEVEL_LABELS[level]}` : '';
  return `${head} ＞ ${roll.candidates.join(', ')} ＞ ${roll.result}${tail}`;
}

/* ---------- 自訂擲骰 ---------- */

/** 自訂擲骰的紀錄：「1D6+1D4+2 ＞ 1D6[3]+1D4[2]+2 ＞ 7」（算式是正規化後的寫法） */
export function customLogText(normalized: string, result: DiceRollResult): string {
  return `${normalized} ＞ ${formatDiceDetail(result.terms)} ＞ ${result.total}`;
}

/**
 * 快速加骰（舊版的規則）：算式先正規化；最後一項與按鈕都是同面數的骰子 → 骰子數相加（2D6）；
 * 最後一項與按鈕都是整數 → 相加；最後一項是減號開頭時不合併、改成接在後面；其他情況接「+按鈕」。
 */
export function appendQuickDice(current: string, token: string): string {
  const cur = normalizeDiceText(current);
  const parts = splitDiceParts(cur);
  const last = parts.length ? parts[parts.length - 1] : '';
  const lastDice = /^([+-]?)(\d+)?D(\d+)$/i.exec(last);
  const tokenDice = /^(\d+)?D(\d+)$/i.exec(token);
  if (lastDice && tokenDice && lastDice[3] === tokenDice[2]) {
    const sign = lastDice[1] || '+';
    const sum = Number.parseInt(lastDice[2] || '1', 10) + Number.parseInt(tokenDice[1] || '1', 10);
    parts[parts.length - 1] = sign === '-' ? `${last}+${token}` : `${sign}${sum}D${lastDice[3]}`;
    return parts.join('').replace(/^\+/, '');
  }
  const lastNum = /^([+-]?)(\d+)$/.exec(last);
  const tokenNum = /^(\d+)$/.exec(token);
  if (lastNum && tokenNum) {
    const sign = lastNum[1] || '+';
    const sum = Number.parseInt(lastNum[2], 10) + Number.parseInt(tokenNum[1], 10);
    parts[parts.length - 1] = sign === '-' ? `${last}+${token}` : `${sign}${sum}`;
    return parts.join('').replace(/^\+/, '');
  }
  if (cur) return `${cur}${/^[+-]/.test(token) ? '' : '+'}${token}`;
  return token.replace(/^\+/, '');
}

/* ---------- 擲骰紀錄 ---------- */

export interface LogEntry {
  id: string;
  /** 顯示用的時間（新版「時:分:秒」，舊版搬過來的照原樣） */
  time: string;
  text: string;
}

let seq = 0;
export function newLogId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** 24 小時制「時:分:秒」 */
export function formatClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 新的一筆放最上面，只留最新的 LOG_MAX 筆 */
export function addLogEntry(list: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  return [entry, ...list].slice(0, LOG_MAX);
}

/** 整理紀錄（讀存檔、專案檔時）：只留有文字的項目 */
export function sanitizeLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.text !== 'string') continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newLogId(),
      time: typeof r.time === 'string' ? r.time : '',
      text: r.text,
    });
    if (out.length >= LOG_MAX) break;
  }
  return out;
}

/** 舊版的紀錄（`[{ time, text }]`，新的在前）→ 新版；讀不懂時 null */
export function legacyLogEntries(raw: string | null): LogEntry[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? sanitizeLog(parsed) : null;
  } catch {
    return null;
  }
}

/* ---------- 傷害計算 ---------- */

export type DamageResult =
  | {
      ok: true;
      armor: number;
      values: number[];
      each: number[];
      total: number;
      command: string;
    }
  | { ok: false; error: 'armor' | 'no-rolls' };

/** 護甲欄：照舊版以 parseInt 取整數，讀不出數字時 null */
export function parseArmor(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/** 傷害計算（舊版的規則）：先檢查護甲，再找每一行結尾的「＞ 數字」，每筆扣護甲（最少 0）後加總 */
export function calculateDamage(armorRaw: string, text: string): DamageResult {
  const armor = parseArmor(armorRaw);
  if (armor === null) return { ok: false, error: 'armor' };
  const values = lineEndTotals(text);
  if (!values.length) return { ok: false, error: 'no-rolls' };
  const { each, total } = applyArmor(values, armor);
  return { ok: true, armor, values, each, total, command: statusChangeCommand(total) };
}

/** 把一行擲骰結果接到傷害計算的文字最後（自訂擲骰 →「帶入傷害計算」） */
export function appendDamageLine(text: string, line: string): string {
  if (!text) return line;
  return text.endsWith('\n') ? `${text}${line}` : `${text}\n${line}`;
}

/* ---------- 專案檔 ---------- */

export interface DiceProject {
  settings: DiceSettings;
  log: LogEntry[];
}

/** 讀專案檔：不是這個工具的資料時 null */
export function readProject(raw: unknown): DiceProject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.settings || typeof r.settings !== 'object' || !Array.isArray(r.log)) return null;
  return { settings: sanitizeSettings(r.settings), log: sanitizeLog(r.log) };
}
