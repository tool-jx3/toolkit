/**
 * 長度欄的標籤（F153）與總長的組成（F152）的文字。純函式。
 */
import type { LmSettings } from './settings';
import { S } from './strings';
import {
  completionStart,
  fadeInDuration,
  isSeamless,
  loopRotations,
  progressDuration,
  rowRounds,
  totalDuration,
  trimNumber,
  vanishDuration,
} from './timing';

/** 長度欄的標籤（F153） */
export function lengthLabel(s: LmSettings): string {
  const L = S.export.lengthLabels;
  if (s.loader.type === 'bar') return L.bar;
  if (s.loader.type === 'loop') return L.loop;
  if (s.loader.type === 'row') return s.row.mode === 'loop' ? L.rowLoop : L.rowProgress;
  return L.none;
}

/** 總長的組成（F152） */
export function breakdown(s: LmSettings): string {
  const total = totalDuration(s);
  if (s.loader.type === 'bar') {
    const fade = fadeInDuration(s);
    const reach = progressDuration(s);
    return S.export.breakdownBar(
      fade,
      reach,
      Math.max(0, completionStart(s) - fade - reach),
      vanishDuration(s),
      total,
    );
  }
  if (s.loader.type === 'loop') {
    const r = loopRotations(s);
    return S.export.breakdownLoop(trimNumber(total), trimNumber(r, 3), isSeamless(r));
  }
  if (s.loader.type === 'row') {
    const rounds = rowRounds(s);
    const A = S.export.rowActions;
    const action =
      s.row.mode === 'loop'
        ? A.loop(rounds)
        : rounds > 1
          ? A.random(rounds)
          : s.row.pattern !== 'all-base'
            ? A.alternating
            : A.progress;
    return S.export.breakdownRow(s.row.count, action, total);
  }
  return S.export.breakdownNone(total);
}
