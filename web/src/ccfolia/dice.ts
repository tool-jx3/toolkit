/**
 * CCFOLIA 的擲骰結果：成功／失敗／無成敗的分類、結果的配色 class、訊息框只放最後一段的規則。
 *
 * 結果配色 class 是 CCFOLIA（emotion）依樣式自動產生的雜湊名稱（觀察日期 2026-09，CCFOLIA 1.37.4），
 * 改主題或改版就可能變：改版時只改這裡。聊天欄與房間訊息框用的是同一組 class。
 */
import { BCDICE_SEPARATOR } from '@/core/coc/bcdice';

export type DiceOutcome = 'success' | 'failure' | 'other';

/** 結果 span／p 上的配色 class（成功、失敗、其他） */
export const DICE_RESULT_CLASS: Readonly<Record<DiceOutcome, string>> = Object.freeze({
  success: 'css-1l6qhgm',
  failure: 'css-1j13mke',
  other: 'css-ucj12',
});

/** CCFOLIA 原本的顯示顏色（沒有自訂 CSS 時） */
export const DICE_RESULT_ORIGINAL_COLOR: Readonly<Record<DiceOutcome, string>> = Object.freeze({
  success: '#2196f3',
  failure: '#dc004e',
  other: 'rgba(255, 255, 255, 0.7)',
});

export const DICE_OUTCOMES: readonly DiceOutcome[] = ['success', 'failure', 'other'];

/**
 * 依 CCFOLIA 的規則分類：結果全文含「成功」或「スペシャル」→成功（含特殊成功、決定的成功）；
 * 否則含「失敗」→失敗（含大失敗、致命的失敗）；否則→其他（2D6、單純 1D100、傷害骰等沒有成敗的擲骰）。
 */
export function classifyDiceResult(text: string): DiceOutcome {
  const s = String(text ?? '');
  if (s.includes('成功') || s.includes('スペシャル')) return 'success';
  if (s.includes('失敗')) return 'failure';
  return 'other';
}

/** 結果分隔符號（BCDice 的全形「＞」；與 `@/core/coc` 的 BCDICE_SEPARATOR 是同一個） */
export const RESULT_SEPARATOR = BCDICE_SEPARATOR;

/**
 * 房間訊息框只顯示結果最後的「＞ …」一段，前面加「🎲 」。
 * 'CC<=50 (1D100<=50) ＞ 23 ＞ 成功' → '🎲 ＞ 成功'；沒有「＞」時整段當作結果。
 */
export function messageBoxResultText(result: string): string {
  const s = String(result ?? '').trim();
  const i = s.lastIndexOf(RESULT_SEPARATOR);
  const tail = i >= 0 ? s.slice(i).replace(/^＞\s*/, '＞ ') : s;
  return `🎲 ${tail}`;
}

/** 結果中第一個「＞ 數字」的數字（訊息框預覽的骰子圖用）；沒有時回傳 fallback */
export function firstResultNumber(result: string, fallback = 50): number {
  const m = /＞\s*(-?\d+)/.exec(String(result ?? ''));
  return m ? Number(m[1]) : fallback;
}

/** 秘密骰在房間訊息框上的內文（內文被換掉、沒有骰子圖與結果） */
export const SECRET_DICE_MESSAGE_BOX_TEXT = 'シークレットダイス';
/** 他人的秘密擲骰在聊天欄的內文（沒有結果 span） */
export const SECRET_DICE_CHAT_TEXT = 'Secret dice 🎲';

/**
 * 用「:HP-2」之類的指令改數值時，CCFOLIA 代為發出的系統訊息內文。
 * 系統訊息沒有名字也沒有頭像（頭像欄是空 div、名稱 span 是空的）。
 */
export function systemStatusMessage(
  characterName: string,
  label: string,
  from: number | string,
  to: number | string,
): string {
  return `[ ${characterName} ] ${label} : ${from} → ${to}`;
}

/** 聊天欄名稱後面的時間（caption）：' - 今日 21:04' */
export function chatTimestamp(date: Date, today = true): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (today) return ` - 今日 ${hh}:${mm}`;
  return ` - ${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate(),
  ).padStart(2, '0')} ${hh}:${mm}`;
}

/** 編輯過的訊息多出的標記 */
export const EDITED_MARK = '[編集済]';
