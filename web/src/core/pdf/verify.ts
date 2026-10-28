/**
 * 壓縮前後的比對（純函式）：頁數、每頁的文字、連結與其他註解、書籤、表單欄位。
 * QC 的原作在測試裡保證這些項目不變（文字層、連結、書籤、表單、中繼資料）；本站在每次壓縮完都實際比一次，
 * 不一樣就不用那個結果（改用下一個比較大的候選，最後是原檔）。
 */
import type { DocSignature } from './pdfjs';

export type VerifyItem = 'pages' | 'text' | 'annotations' | 'outline' | 'fields';

export interface VerifyResult {
  ok: boolean;
  /** 不一樣的項目 */
  mismatches: VerifyItem[];
  /** 第一個不一樣的頁碼（從 1 起；文字或註解不一樣時） */
  page: number | null;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function compareSignatures(before: DocSignature, after: DocSignature): VerifyResult {
  const mismatches: VerifyItem[] = [];
  let page: number | null = null;
  if (before.pages !== after.pages) mismatches.push('pages');
  const n = Math.min(before.text.length, after.text.length);
  for (let i = 0; i < n; i++) {
    if (before.text[i] !== after.text[i]) {
      if (!mismatches.includes('text')) mismatches.push('text');
      page ??= i + 1;
    }
    if (!sameList(before.annotations[i] ?? [], after.annotations[i] ?? [])) {
      if (!mismatches.includes('annotations')) mismatches.push('annotations');
      page ??= i + 1;
    }
  }
  if (before.text.length !== after.text.length && !mismatches.includes('pages'))
    mismatches.push('pages');
  if (!sameList(before.outline, after.outline)) mismatches.push('outline');
  if (!sameList(before.fields, after.fields)) mismatches.push('fields');
  return { ok: mismatches.length === 0, mismatches, page };
}
