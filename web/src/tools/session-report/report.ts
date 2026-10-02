/**
 * 從表單產生團報文：整理資料（3.1）→ 範本排部件（3.2）→ 文字樣式（3.3）→ 整理（3.5）→ 作者行（3.4）。
 * 規格：docs/refactor/specs/session-report.md 第 3 節。純函式，不依賴畫面。
 */
import { toUnicodeStyle, type UnicodeTextStyle } from '@/core/social';
import { HONORIFIC_TEXT, type ReportSettings, type SlotBase, systemName } from './model';
import { type Part, type ReportData, type ReportPlayer, STYLED_KINDS } from './parts';
import { buildParts } from './templates';

/** 欄位空白時寫進團報的範例值（自寫） */
export const SAMPLE = {
  system: '自訂系統',
  scenario: '劇本標題',
  result: 'END 全員生還',
  gm: '主持人名字',
  pc: (i: number) => `角色${sampleLetter(i)}`,
  pl: (i: number) => `玩家${sampleLetter(i)}`,
} as const;

/** 範例值的編號：A～I，第 10 列以後用數字 */
export function sampleLetter(index: number): string {
  return 'ABCDEFGHI'[index] ?? String(index + 1);
}

/** 開頁當天的本地日期（YYYY/M/D，月日不補零） */
export function todayText(now: Date = new Date()): string {
  return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
}

/** 名字＋敬稱（已經以該字結尾、或名字是空的時不加） */
export function withHonorific(name: string, suffix: string): string {
  const text = String(name ?? '').trim();
  if (!text || !suffix || text.endsWith(suffix)) return text;
  return text + suffix;
}

/** 第 n 列（從 1 起算）的標記 */
export function slotFor(base: SlotBase | string, n: number): string {
  if (/^PC\d+$/i.test(base)) return `PC${n}`;
  if (/^HO\d+$/i.test(base)) return `HO${n}`;
  return base;
}

const AUTHOR_HONORIFICS = '様|さん|氏|先生|樣|桑|老師';
const AUTHOR_TRAILING_SPACE = new RegExp(`\\s+(${AUTHOR_HONORIFICS})$`);
const AUTHOR_ENDS_HONORIFIC = new RegExp(`(?:${AUTHOR_HONORIFICS})$`);

/** 作者行（3.4）：空白時空字串 */
export function authorLine(author: string): string {
  const text = String(author ?? '')
    .trim()
    .replace(AUTHOR_TRAILING_SPACE, '$1');
  if (!text) return '';
  if (/^(作|作者)[:：]/.test(text)) return text.replace(/^(作|作者):/, '$1：');
  return `作者：${AUTHOR_ENDS_HONORIFIC.test(text) ? text : `${text}老師`}`;
}

/** 表單 → 團報的資料（3.1） */
export function collectReportData(s: ReportSettings, today: string): ReportData {
  const suffix = HONORIFIC_TEXT[s.honorific] ?? '';
  let gms = s.gms
    .map((g, i) => ({
      role: g.role,
      name: withHonorific(g.name.trim() || (i === 0 ? SAMPLE.gm : ''), suffix),
    }))
    .filter((g) => g.name);
  if (!gms.length) gms = [{ role: 'KP', name: SAMPLE.gm }];
  let players: ReportPlayer[] = s.players.map((p, i) => ({
    slot: slotFor(s.slot, i + 1),
    ho: p.ho.trim(),
    pc: p.pc.trim() || SAMPLE.pc(i),
    pl: withHonorific(p.pl.trim() || SAMPLE.pl(i), suffix),
  }));
  if (!players.length) players = [{ slot: 'HO1', ho: '', pc: SAMPLE.pc(0), pl: SAMPLE.pl(0) }];
  const firstSlot = players[0].slot;
  const plFirst =
    firstSlot === 'PL/PC' ? true : firstSlot === 'PC/PL' ? false : s.nameOrder === 'plpc';
  return {
    system: s.system === 'custom' ? s.customSystem.trim() || SAMPLE.system : systemName(s.system),
    scenario: s.scenario.trim() || SAMPLE.scenario,
    author: authorLine(s.author),
    result: s.result.trim() || SAMPLE.result,
    date: s.date.trim() || today,
    tags: s.hashtags.trim(),
    gms,
    players,
    plFirst,
  };
}

/** 部件接成文字：樣式部件套用文字樣式，空的部件不輸出 */
export function joinParts(parts: readonly Part[], style: UnicodeTextStyle): string {
  return parts
    .map((p) => (p.value && STYLED_KINDS.has(p.kind) ? toUnicodeStyle(p.value, style) : p.value))
    .join('');
}

/** 整理（3.5）：行尾的半形空白與 Tab、連續 3 個以上的換行、頭尾空白 */
export function tidyReport(text: string): string {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 作者行插在第一個含劇本名稱的行下面（3.4；團報裡已經有時不插） */
export function insertAuthorLine(text: string, author: string, scenario: string): string {
  if (!author || !scenario || text.includes(author)) return text;
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.includes(scenario));
  if (index < 0) return text;
  lines.splice(index + 1, 0, author);
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 表單 → 團報文 */
export function renderReport(s: ReportSettings, today: string): string {
  const data = collectReportData(s, today);
  const text = tidyReport(joinParts(buildParts(s.template, data), s.fontStyle));
  return insertAuthorLine(text, data.author, data.scenario);
}
