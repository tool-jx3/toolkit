/**
 * 讀取共用的小工具（不依賴 React）：詞表編成的查詢、數字的讀法、正規表示式的選項字串。
 */
import { wordKey } from './words';

/** 數字的讀法：NFKC 後去掉千分位逗號與空白，讀開頭的數字（「１２」→ 12、「1,200」→ 1200、「12abc」→ 12）；讀不出時 null */
export function readNumber(v: unknown): number | null {
  const n = Number.parseFloat(
    String(v ?? '')
      .normalize('NFKC')
      .replace(/[,\s]/g, ''),
  );
  return Number.isFinite(n) ? n : null;
}

/** 正規表示式的特殊字元跳脫 */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 詞表 → 正規表示式的選項（長的在前，「NPC資料」不會先被「NPC」吃掉） */
export function alternation(words: readonly string[]): string {
  return [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
}

/** 詞表 → 依 wordKey 查詢的集合 */
export function keySet(words: readonly string[]): Set<string> {
  return new Set(words.map(wordKey));
}
