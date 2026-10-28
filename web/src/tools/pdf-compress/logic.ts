/**
 * PDF 壓縮器的純邏輯（不依賴 React；單元測試直接用）：檔名、減少的百分比、Discord 的上限、
 * 這一列要不要重新壓縮、結果的說明文字。
 */

import { formatBytes, safeFileName, splitExtension, uniqueFileName } from '@/core/files';
import type { CompressReport, PdfErrorKind, ResolvedSettings, SkipReason } from '@/core/pdf';
import { S } from './strings';

/** Discord 免費帳號的上傳上限（10 MB；自訂，以 10 × 1024 × 1024 位元組計） */
export const DISCORD_LIMIT = 10 * 1024 * 1024;

/** 輸出的檔名最多幾個字（含「_壓縮.pdf」；自訂） */
export const MAX_NAME_LENGTH = 160;

/**
 * 壓縮後的檔名：`<原檔名>_壓縮.pdf`；保留原檔時用原檔名（檔名清理照 safeFileName）。
 * 太長時截原檔名的部分，「_壓縮.pdf」一定留著。
 */
export function outputName(original: string, kept: boolean): string {
  const trimmed = original.trim();
  const { base, ext } = splitExtension(trimmed);
  const isPdf = ext === 'pdf';
  const stem = isPdf ? base : trimmed;
  /* 保留原檔：副檔名照原本的寫法（.PDF 也照舊） */
  const tail = kept ? (isPdf ? trimmed.slice(base.length) : '.pdf') : `${S.outputSuffix}.pdf`;
  const clean = safeFileName(stem, {
    fallback: 'PDF',
    maxLength: MAX_NAME_LENGTH - Array.from(tail).length,
  });
  return `${clean}${tail}`;
}

/** ZIP 裡的檔名（同名時 _2、_3…） */
export function zipEntryNames(items: readonly { name: string; kept: boolean }[]): string[] {
  const used = new Set<string>();
  return items.map((it) => uniqueFileName(outputName(it.name, it.kept), used));
}

/** 減少的百分比（四捨五入成整數；沒有變小時 0） */
export function savedPercent(original: number, output: number): number {
  if (!(original > 0) || output >= original) return 0;
  return Math.round(((original - output) / original) * 100);
}

/** 「12.3 MB → 3.4 MB（減少 72%）」 */
export function sizeLine(original: number, output: number): string {
  return `${S.sizes(formatBytes(original), formatBytes(output))}（${S.saved(savedPercent(original, output))}）`;
}

/** 設定的指紋（這一列用什麼設定壓的；不一樣就要重新壓） */
export function settingsKey(s: ResolvedSettings): string {
  return JSON.stringify(s);
}

/** 錯誤之後重壓也沒用的種類（檔案本身的問題） */
const PERMANENT: readonly PdfErrorKind[] = [
  'not-pdf',
  'empty',
  'too-large',
  'broken',
  'unreadable',
];

export type ItemState = 'probing' | 'password' | 'ready' | 'running' | 'done' | 'kept' | 'error';

export interface WorkState {
  state: ItemState;
  /** 壓縮（或失敗）時用的設定 */
  key: string | null;
  errorKind: PdfErrorKind | null;
}

/** 按「開始壓縮」時這一列要不要處理 */
export function needsWork(item: WorkState, key: string): boolean {
  switch (item.state) {
    case 'ready':
      return true;
    case 'done':
    case 'kept':
      return item.key !== key;
    case 'error':
      return !!item.errorKind && !PERMANENT.includes(item.errorKind) && item.key !== key;
    default:
      return false;
  }
}

/** 結果（不含位元組）：清單裡留著顯示用 */
export type ReportSummary = Omit<CompressReport, 'bytes' | 'candidates'>;

export function summarize(r: CompressReport): ReportSummary {
  const { bytes: _b, candidates: _c, ...rest } = r;
  return rest;
}

/** 沒動的影像：依張數排序的「原因 張數」 */
export function skippedList(skipped: Partial<Record<SkipReason, number>>): string[] {
  /* 意思相同的原因合併（讀不出來） */
  const merged = new Map<string, number>();
  for (const [k, v] of Object.entries(skipped) as [SkipReason, number][]) {
    if (!v) continue;
    const label = S.skipReasons[k];
    merged.set(label, (merged.get(label) ?? 0) + v);
  }
  return [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} ${c}`);
}

export function skippedCount(skipped: Partial<Record<SkipReason, number>>): number {
  return Object.values(skipped).reduce((a, b) => a + (b ?? 0), 0);
}

/** 結果的說明（一行一則） */
export function resultLines(r: ReportSummary, level: ResolvedSettings['level']): string[] {
  const lines: string[] = [];
  if (!r.kept) {
    const parts: string[] = [S.strategies[r.strategy]];
    if (r.strategy === 'images' && r.images) {
      parts[0] = S.imagesDone(r.images.replaced, r.images.downscaled, r.images.converted);
    }
    if ((r.strategy === 'images' || r.strategy === 'dedupe') && r.dedupe?.merged) {
      parts.push(S.dedupeDone(r.dedupe.merged));
    }
    if (r.strategy === 'raster' && r.raster) {
      parts[0] = S.rasterDpi(r.raster.dpi);
      if (r.raster.reduced) parts.push(S.rasterReduced(r.raster.dpi));
      if (r.raster.grayPages) parts.push(S.rasterGray(r.raster.grayPages));
    }
    lines.push(S.method(parts.join('；')));
    /* 整頁轉圖的等級、結果卻不是圖片：說明為什麼 */
    if (level === 'raster' && r.strategy !== 'raster' && !r.restricted) {
      if (r.missingFonts.length) lines.push(S.rasterSkippedFonts(fontNames(r.missingFonts)));
      else if (r.raster) lines.push(S.rasterNotSmaller);
      else lines.push(S.rasterFailed);
    }
    if (r.imagesError) lines.push(S.imagesFailed);
  }
  if (r.images && r.strategy !== 'raster') {
    const n = skippedCount(r.images.skipped);
    if (n) lines.push(`${S.skippedTitle(n)}${skippedList(r.images.skipped).join('、')}`);
  }
  if (r.verify?.ok) lines.push(r.strategy === 'raster' ? S.verifiedRaster : S.verified);
  else if (r.verifySkipped) lines.push(S.verifySkipped);
  if (r.rejectedByVerify && !r.kept) lines.push(S.rejectedByVerify(r.rejectedByVerify));
  if (r.restricted) lines.push(S.noteRestricted);
  if (r.decrypted) lines.push(S.noteDecrypted);
  if (r.signed && !r.kept) lines.push(S.noteSigned);
  if (r.strategy === 'raster') lines.push(S.noteRaster);
  if (r.outputBytes <= DISCORD_LIMIT) lines.push(S.discordOk);
  else lines.push(S.discordOver(level !== 'smallest' && level !== 'raster'));
  return lines;
}

/** 字型名稱（最多 3 個） */
export const fontNames = (names: readonly string[]) => names.slice(0, 3).join('、');

/** 保留原檔的原因 */
export function keptReason(r: ReportSummary, level: ResolvedSettings['level']): string {
  if (r.restricted) return S.keptRestricted;
  if (level === 'raster' && r.missingFonts.length) {
    return S.keptMissingFonts(fontNames(r.missingFonts));
  }
  if (r.rejectedByVerify) return S.keptVerify;
  if (level === 'lossless') return S.keptLossless;
  if (level === 'raster') return S.keptRaster;
  if (r.imagesError) return S.keptImagesFailed;
  return S.keptCompact;
}
