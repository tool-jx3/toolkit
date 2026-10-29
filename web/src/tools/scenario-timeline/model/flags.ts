/**
 * 刻度下方的「標記列」（規格 F36～F38）：標記、目前進度、現在時刻的旗子；靠得太近時往下疊一層。
 * 互動的時間軸與匯出共用。純計算。
 */
import { stackLevels } from './layout';
import { readTime } from './time';
import { NOW_COLOR } from './types';
import { progressValue, type VisibleDoc } from './visible';

export type FlagKind = 'marker' | 'progress' | 'now';

export interface Flag {
  id: string;
  kind: FlagKind;
  v: number;
  label: string;
  color: string;
  /** PL 版看不到 */
  secret: boolean;
  gm: boolean;
}

export interface PlacedFlag extends Flag {
  level: number;
  /** 旗子的寬（px，含左右留白） */
  w: number;
}

export const FLAG_H = 18;
export const FLAG_GAP = 3;
export const FLAG_PAD = 6;
export const PROGRESS_ID = '__progress';
export const NOW_ID = '__now';

export const flagRowHeight = (levels: number) =>
  levels > 0 ? FLAG_GAP + levels * (FLAG_H + FLAG_GAP) : 0;

/** 要畫的旗子（標記、目前進度、現在時刻） */
export function collectFlags(
  vdoc: VisibleDoc,
  labels: { progress: string; now: string },
  nowV: number | null,
): Flag[] {
  const out: Flag[] = [];
  for (const m of vdoc.markers) {
    const t = readTime(vdoc.mode, m.time, vdoc.era);
    if (!t) continue;
    out.push({
      id: m.id,
      kind: 'marker',
      v: t.v,
      label: m.label.trim() || '標記',
      color: m.color,
      secret: m.secret,
      gm: m.gm,
    });
  }
  const p = progressValue(vdoc);
  if (p !== null)
    out.push({
      id: PROGRESS_ID,
      kind: 'progress',
      v: p,
      label: labels.progress,
      color: '',
      secret: false,
      gm: false,
    });
  if (nowV !== null && vdoc.mode === 'date' && vdoc.showNow)
    out.push({
      id: NOW_ID,
      kind: 'now',
      v: nowV,
      label: labels.now,
      color: NOW_COLOR,
      secret: false,
      gm: false,
    });
  return out;
}

/** 旗子的位置：從線往右畫，重疊時往下一層（最多 3 層，再多就疊在第 3 層） */
export function placeFlags(
  flags: readonly Flag[],
  xOf: (v: number) => number,
  measure: (t: string) => number,
  maxLevels = 3,
): { flags: PlacedFlag[]; levels: number } {
  const geo = flags.map((f, index) => {
    const w = Math.ceil(measure(f.label)) + FLAG_PAD * 2;
    const left = xOf(f.v);
    return { index, left, right: left + w, w };
  });
  const { levels } = stackLevels(geo, 4);
  const placed = flags.map((f, i) => ({
    ...f,
    level: Math.min(maxLevels - 1, levels[i]),
    w: geo[i].w,
  }));
  const count = placed.length ? Math.max(...placed.map((f) => f.level)) + 1 : 0;
  return { flags: placed, levels: count };
}
