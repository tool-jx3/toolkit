/**
 * 掃描檢查的結果 → 預覽下面的檢查清單：讀得出來嗎、讀回來的內容對不對、靠錯誤更正修了多少、
 * 顏色的對比、反色、透明背景、格子太小、四周留白太窄。
 */

import { type QrEcl, type QrPixelCheck, qrPaintContrast } from '@/core/qr';
import type { IssueItem } from '@/ui';
import { backgroundPaint, type DocState, foregroundPaints } from './model';
import type { QrBuild } from './render';
import { S } from './strings';

export interface CheckView {
  notice: { tone: 'error' | 'info' | 'success'; message: string } | null;
  items: IssueItem[];
}

/** 對比門檻（WCAG 的算法，最差的那一對顏色）：低於 LOW 警告、低於 FAIR 提醒 */
export const CONTRAST_LOW = 3;
export const CONTRAST_FAIR = 4.5;
/** 一格小於這個 px 時提醒 */
export const SMALL_CELL = 3;
/** 四周留白少於這麼多格時提醒（方形） */
export const QUIET_CELLS = 2;

const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** 只看設定就知道的提醒（不必等畫好） */
export function styleIssues(d: DocState, built: Extract<QrBuild, { ok: true }>): IssueItem[] {
  const items: IssueItem[] = [];
  const c = qrPaintContrast(foregroundPaints(d), backgroundPaint(d.background));
  if (c.inverted) items.push({ id: 'inverted', level: 'warning', message: S.checkInverted });
  if (c.ratio < CONTRAST_LOW)
    items.push({ id: 'contrast', level: 'warning', message: S.checkContrastLow(fmt(c.ratio)) });
  else if (c.ratio < CONTRAST_FAIR)
    items.push({ id: 'contrast', level: 'info', message: S.checkContrastFair(fmt(c.ratio)) });
  if (d.background.mode === 'transparent')
    items.push({ id: 'transparent', level: 'info', message: S.checkTransparent });
  const cell = built.scene.grid.cell;
  if (cell < SMALL_CELL)
    items.push({ id: 'small', level: 'warning', message: S.checkSmallCell(fmt(cell)) });
  if (d.shape === 'square') {
    const g = built.scene.grid;
    const quiet =
      Math.min(g.x, g.y, d.width - g.x - g.count * cell, d.height - g.y - g.count * cell) / cell;
    if (quiet < QUIET_CELLS)
      items.push({ id: 'quiet', level: 'info', message: S.checkQuiet(fmt(Math.max(0, quiet))) });
  }
  return items;
}

/** 合併兩份清單（同一個 id 只留第一個） */
export function mergeIssues(...lists: IssueItem[][]): IssueItem[] {
  const seen = new Set<string>();
  const out: IssueItem[] = [];
  for (const it of lists.flat()) {
    if (it.id && seen.has(it.id)) continue;
    if (it.id) seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** 畫好之後讀回來的結果（讀不出來時 ok＝false） */
export function pixelIssues(
  d: DocState,
  check: QrPixelCheck,
): { ok: boolean; version: number; ecl: QrEcl; items: IssueItem[] } {
  const r = check.decoded;
  const inv = check.invertedDecoded;
  const items: IssueItem[] = [];
  const lost = check.finders.flatMap((ok, i) => (ok ? [] : [S.cornerNames[i]]));
  if (lost.length)
    items.push({ id: 'finder', level: 'error', message: S.checkFinder(lost.join('、')) });
  const got = r.ok ? r : inv;
  if (!got?.ok) {
    const reason = r.ok ? '' : S.checkFailReason[r.reason];
    items.unshift({ id: 'fail', level: 'error', message: `${reason}${S.checkFailTips}` });
    return { ok: false, version: 0, ecl: d.qr.ecl, items };
  }
  if (got.text !== d.data) {
    items.unshift({ id: 'mismatch', level: 'error', message: S.checkMismatch(got.text) });
    return { ok: false, version: got.version, ecl: got.ecl, items };
  }
  /* 只有反過來讀得出來：一定要提醒反色（設定看不出來時也是） */
  if (!r.ok) items.push({ id: 'inverted', level: 'warning', message: S.checkInverted });
  if (got.corrected > 0) {
    const pct = Math.round(got.worst * 100);
    items.push({
      id: 'corrected',
      level: got.worst >= 0.5 ? 'warning' : 'info',
      message: `${S.checkCorrected(got.corrected, pct)}${got.worst >= 0.5 ? S.checkCorrectedHint : ''}`,
    });
  }
  return { ok: true, version: got.version, ecl: got.ecl, items };
}

/**
 * 整理成預覽下面的清單：上面一行是總結——讀不出來或有錯誤（例如找不到定位方框）＝紅、
 * 讀得出來但有警告＝提醒、都沒問題＝綠；下面是每一項。
 */
export function checkView(
  d: DocState,
  built: Extract<QrBuild, { ok: true }>,
  check: QrPixelCheck,
): CheckView {
  const px = pixelIssues(d, check);
  const items = mergeIssues(px.items, styleIssues(d, built));
  const notice: CheckView['notice'] = !px.ok
    ? { tone: 'error', message: S.checkFail }
    : items.some((i) => i.level === 'error')
      ? { tone: 'error', message: S.checkRisky }
      : items.some((i) => i.level === 'warning')
        ? { tone: 'info', message: S.checkOkWarn(px.version, px.ecl) }
        : { tone: 'success', message: S.checkOk(px.version, px.ecl) };
  return { notice, items };
}
