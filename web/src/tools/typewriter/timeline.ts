/**
 * 四個模式的時間軸（純函式，不依賴畫布，單元測試直接比對規格附件）。
 *
 * - 打字：每格多一個「單位」（字、空白、換行；韓文音節依組字過程 2～3 步），最後一格是停留格；
 *   整體淡出／逐字淡出；圖形旋轉時停留格拆成多個一般格（規格 3.2、3.5、3.6）。
 * - 故障：逐字（每個字先閃 n 格亂碼）或同時亂碼、依序還原；半形空白與換行不閃、不佔格（3.7）。
 * - 片尾名單：等速由下往上捲；以空白行分段，各段長度按字數比例（3.8）。
 * - 卡拉 OK：時間標記、自動分配、排程、影格，以及五種「顯示哪些句子」的可見度（3.9）。
 */
import { hashUnit } from '@/core/timeline';
import { type TypingStep, typingSteps, typingVisibleAt } from '@/core/typeset';
import type { FadeKind, GlitchCharsets, KaraokeShow } from './settings';

/** 換行一律以 LF 看待，以碼位為單位切字 */
export function toUnits(text: string): string[] {
  return Array.from(String(text ?? '').replace(/\r\n?/g, '\n'));
}

export const normalizeNewlines = (text: string): string =>
  String(text ?? '').replace(/\r\n?/g, '\n');

/* ====================== 打字 ====================== */

export interface TypingFrame {
  /** 做完前幾步（typingVisibleAt 的 count） */
  count: number;
  /** 逐字淡出時每個單位（units 的索引）的透明度；null＝全部 1 */
  alphas: number[] | null;
  /** 整體透明度（整體淡出） */
  alpha: number;
  /** 圖形的旋轉角度（度，正數順時針） */
  rotation: number;
  /** 這一格的長度（毫秒） */
  ms: number;
  /** 停留格 */
  hold: boolean;
}

export interface TypingTimelineInput {
  text: string;
  reverse: boolean;
  fade: FadeKind;
  fadeMs: number;
  fps: number;
  holdMs: number;
  /** 圖形模式（不使用＝false） */
  shape: boolean;
  /** 每格旋轉角度（度） */
  rotate: number;
}

export interface TypingTimeline {
  units: string[];
  steps: TypingStep[];
  frames: TypingFrame[];
}

/** 淡出格數：淡出長度 × FPS ÷ 1000 四捨五入，至少 1；淡出長度 0 時沒有淡出格 */
export function fadeFrameCount(fadeMs: number, fps: number): number {
  if (!(fadeMs > 0)) return 0;
  return Math.max(1, Math.round((fadeMs * fps) / 1000));
}

/** 圖形旋轉時停留格拆成的一般格數：停留時間 × FPS ÷ 1000 四捨五入，至少 1 */
export function holdSplitCount(holdMs: number, fps: number): number {
  return Math.max(1, Math.round((holdMs * fps) / 1000));
}

export function typingTimeline(o: TypingTimelineInput): TypingTimeline {
  const units = toUnits(o.text);
  if (!units.length) return { units, steps: [], frames: [] };
  const steps = typingSteps(units, { reverse: o.reverse });
  const U = steps.length;
  const each = 1000 / o.fps;
  const N = o.fade === 'none' ? 0 : fadeFrameCount(o.fadeMs, o.fps);
  const perChar = o.fade === 'each';
  /* 每個字「完成」（韓文是完整音節出現）的那一格 */
  const done = units.map(() => -1);
  steps.forEach((st, k) => {
    if (st.final) done[st.index] = k;
  });
  const base: TypingFrame[] = [];
  const total = perChar ? U + N : U;
  for (let f = 0; f < total; f++) {
    const alphas = perChar
      ? units.map((_, i) => {
          const c = done[i];
          if (c < 0 || c > f) return 1;
          if (N === 0) return f === c ? 1 : 0;
          return Math.max(0, 1 - (f - c) / N);
        })
      : null;
    base.push({ count: Math.min(U, f + 1), alphas, alpha: 1, rotation: 0, ms: each, hold: false });
  }
  /* 停留格：不淡出、整體淡出＝打完的那一格；逐字淡出＝最後那一格（全空的畫面） */
  const holdIndex = total - 1;
  base[holdIndex] = { ...base[holdIndex], ms: o.holdMs, hold: true };

  let frames = base;
  if (o.shape && o.rotate !== 0) {
    /* 旋轉中：停留格拆成多個一般格，讓圖形在停留期間繼續轉 */
    const h = base[holdIndex];
    const copies = Array.from({ length: holdSplitCount(o.holdMs, o.fps) }, () => ({
      ...h,
      ms: each,
      hold: false,
    }));
    frames = [...base.slice(0, holdIndex), ...copies, ...base.slice(holdIndex + 1)];
  }
  if (o.fade === 'whole' && N > 0) {
    const last = frames[frames.length - 1];
    for (let j = 1; j <= N; j++) frames.push({ ...last, alpha: 1 - j / N, ms: each, hold: false });
  }
  frames = frames.map((f, i) => ({ ...f, rotation: o.shape ? i * o.rotate : 0 }));
  return { units, steps, frames };
}

/** 某一格畫面上看得到的文字（反向時各字仍在原位，所以依原文順序串起來） */
export function typingScreenText(tl: TypingTimeline, frame: number): string {
  const f = tl.frames[frame];
  if (!f) return '';
  return typingVisibleAt(tl.units, tl.steps, f.count)
    .filter((c): c is string => c !== null)
    .join('');
}

/** 某一格畫面上的字（不含換行）的透明度，由前到後 */
export function typingScreenAlphas(tl: TypingTimeline, frame: number): number[] {
  const f = tl.frames[frame];
  if (!f) return [];
  const shown = typingVisibleAt(tl.units, tl.steps, f.count);
  const out: number[] = [];
  shown.forEach((c, i) => {
    if (c === null || c === '\n') return;
    out.push(f.alphas ? f.alphas[i] : 1);
  });
  return out;
}

/** 打字的單位數（音效的時間點數） */
export function typingUnitCount(text: string): number {
  const units = toUnits(text);
  return units.length ? typingSteps(units).length : 0;
}

/* ====================== 故障 ====================== */

export interface GlitchFrame {
  /** 顯示 units 的前幾個 */
  shown: number;
  /** 這一格顯示亂碼的位置（units 的索引） */
  glitched: readonly number[];
  ms: number;
  hold: boolean;
}

export interface GlitchTimelineInput {
  text: string;
  intensity: number;
  together: boolean;
  fps: number;
  holdMs: number;
}

export interface GlitchTimeline {
  units: string[];
  /** 會閃亂碼的位置（不是半形空白、換行的字） */
  targets: number[];
  frames: GlitchFrame[];
}

/** 不閃亂碼、不佔格的字：半形空白與換行（全形空白照樣會閃） */
export const isGlitchSkip = (ch: string): boolean => ch === ' ' || ch === '\n';

export function glitchTimeline(o: GlitchTimelineInput): GlitchTimeline {
  const units = toUnits(o.text);
  const targets: number[] = [];
  units.forEach((c, i) => {
    if (!isGlitchSkip(c)) targets.push(i);
  });
  const frames: GlitchFrame[] = [];
  if (!targets.length) return { units, targets, frames };
  const each = 1000 / o.fps;
  const I = Math.max(0, Math.floor(o.intensity));
  if (!o.together) {
    for (const i of targets) {
      for (let r = 0; r < I; r++)
        frames.push({ shown: i + 1, glitched: [i], ms: each, hold: false });
      frames.push({ shown: i + 1, glitched: [], ms: each, hold: false });
    }
  } else {
    targets.forEach((_, k) => {
      const rest = targets.slice(k);
      for (let r = 0; r < I; r++)
        frames.push({ shown: units.length, glitched: rest, ms: each, hold: false });
    });
    frames.push({ shown: units.length, glitched: [], ms: each, hold: false });
  }
  const last = frames.length - 1;
  frames[last] = { ...frames[last], ms: o.holdMs, hold: true };
  return { units, targets, frames };
}

/** 亂碼字元的範圍（Unicode 碼位，含頭尾）：每個類別 1～2 段 */
export const GLITCH_RANGES: Record<keyof GlitchCharsets, readonly (readonly [number, number])[]> = {
  latin: [[0x21, 0x7e]],
  kana: [
    [0x3041, 0x3096],
    [0x30a1, 0x30fa],
  ],
  hangul: [
    [0x3131, 0x318e],
    [0xac00, 0xd7a3],
  ],
  shapes: [
    [0x2500, 0x257f],
    [0x25a0, 0x25ff],
  ],
};

/** 勾選的類別包含的所有段（全部不勾時當成只勾拉丁） */
export function glitchSegments(c: GlitchCharsets): (readonly [number, number])[] {
  const keys = (['latin', 'kana', 'hangul', 'shapes'] as const).filter((k) => c[k]);
  return (keys.length ? keys : (['latin'] as const)).flatMap((k) => GLITCH_RANGES[k]);
}

/**
 * 第 frame 格、第 pos 個字的亂碼（決定性：同一組種子每次都一樣）。
 * 先在各段之間等機率選一段，再在段內等機率選一個碼位。
 */
export function glitchChar(
  seed: number,
  frame: number,
  pos: number,
  segments: readonly (readonly [number, number])[],
): string {
  const a = hashUnit(seed, frame, pos * 2);
  const b = hashUnit(seed, frame, pos * 2 + 1);
  const [lo, hi] = segments[Math.min(segments.length - 1, Math.floor(a * segments.length))];
  return String.fromCodePoint(lo + Math.min(hi - lo, Math.floor(b * (hi - lo + 1))));
}

/** 規格附件的寫法：亂碼的位置寫成「◆」 */
export function glitchPattern(tl: GlitchTimeline, frame: number, mark = '◆'): string {
  const f = tl.frames[frame];
  if (!f) return '';
  const g = new Set(f.glitched);
  return tl.units
    .slice(0, f.shown)
    .map((c, i) => (g.has(i) ? mark : c))
    .join('');
}

/* ====================== 片尾名單 ====================== */

/** 格數＝總時間 × FPS 無條件捨去，至少 2 */
export function creditsFrameCount(duration: number, fps: number): number {
  return Math.max(2, Math.floor(duration * fps + 1e-9));
}

/** 第 i 格第一行字身框上緣的 y：從「畫布高」等速移到「−整段高」 */
export function creditsTop(i: number, n: number, canvasH: number, blockH: number): number {
  if (n <= 1) return canvasH;
  return canvasH - ((canvasH + blockH) * i) / (n - 1);
}

export interface CreditSegment {
  /** 段號（從 1 起算；跳過的空段也算號） */
  number: number;
  /** 去掉頭尾空白後的文字 */
  text: string;
  /** 字數（去掉頭尾空白後） */
  chars: number;
  /** 長度（秒） */
  duration: number;
  frames: number;
}

/**
 * 以空白行（只含空白字元的行也算；連續多個空白行算一個分隔）切段。
 * 各段長度＝總時間 × 該段字數（去頭尾空白）÷ 全部段落字數總和（未去頭尾空白）——保留舊版的算法（主控裁定）。
 * 去掉頭尾空白後是空的段跳過，但編號照算。
 */
export function creditSegments(text: string, duration: number, fps: number): CreditSegment[] {
  const parts = normalizeNewlines(text).split(/\n\s*\n/);
  const total = parts.reduce((sum, p) => sum + Array.from(p).length, 0);
  const out: CreditSegment[] = [];
  parts.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const chars = Array.from(t).length;
    const d = total > 0 ? (duration * chars) / total : 0;
    out.push({
      number: i + 1,
      text: t,
      chars,
      duration: d,
      frames: creditsFrameCount(d, fps),
    });
  });
  return out;
}

/* ====================== 卡拉 OK ====================== */

export interface LyricLine {
  /** 顯示的文字（去掉時間標記；前導空白保留） */
  text: string;
  /** 會唱（只有空白的行不唱、不顯示） */
  sung: boolean;
  /** 時間標記指定的秒數；沒有標記為 null */
  tagged: number | null;
  /** 按字數分配時的權重：去掉頭尾空白後的字數，至少 1 */
  weight: number;
}

/** 行尾的「|」＋秒數（整數、小數或 .5），後面只能有空白；多個「|」時取最後一個 */
const TAG = /^(.*)\|\s*(\d+(?:\.\d+)?|\.\d+)\s*$/;

export function parseLyrics(text: string): LyricLine[] {
  return normalizeNewlines(text)
    .split('\n')
    .map((line) => {
      const m = TAG.exec(line);
      const shown = m ? m[1].replace(/\s+$/, '') : line;
      const trimmed = shown.trim();
      const sung = trimmed !== '';
      return {
        text: shown,
        sung,
        tagged: m && sung ? Number(m[2]) : null,
        weight: Math.max(1, Array.from(trimmed).length),
      };
    });
}

export interface ScheduledLine extends LyricLine {
  start: number;
  length: number;
}

export interface LyricSchedule {
  lines: ScheduledLine[];
  /** 結束時間（等待＋各句時間總和） */
  end: number;
  /** 會唱的句子在 lines 裡的索引 */
  sung: number[];
}

export function scheduleLyrics(
  lines: readonly LyricLine[],
  { duration, intro, alloc }: { duration: number; intro: number; alloc: 'chars' | 'equal' },
): LyricSchedule {
  const sung = lines.filter((l) => l.sung);
  const assigned = sung.reduce((s, l) => s + (l.tagged ?? 0), 0);
  const remaining = Math.max(0, duration - assigned);
  const auto = sung.filter((l) => l.tagged === null);
  const weightSum = auto.reduce((s, l) => s + l.weight, 0);
  const lengthOf = (l: LyricLine): number => {
    if (!l.sung) return 0;
    if (l.tagged !== null) return l.tagged;
    if (alloc === 'equal') return auto.length ? remaining / auto.length : 0;
    return weightSum > 0 ? (remaining * l.weight) / weightSum : 0;
  };
  let cursor = intro;
  const out: ScheduledLine[] = lines.map((l) => {
    const length = lengthOf(l);
    const start = cursor;
    cursor += length;
    return { ...l, start, length };
  });
  const sungIdx: number[] = [];
  out.forEach((l, i) => {
    if (l.sung) sungIdx.push(i);
  });
  return { lines: out, end: cursor, sung: sungIdx };
}

export interface KaraokeFrame {
  /** 畫這一格用的時間（秒） */
  t: number;
  ms: number;
  hold: boolean;
}

/**
 * 影格：t＝0、1/FPS、2/FPS…共「結束時間 × FPS 無條件進位（至少 2）」格，最後再加 1 格停留格（畫結束時的畫面）。
 * 沒有要唱的句子時沒有影格。
 */
export function karaokeFrames(sched: LyricSchedule, fps: number, holdMs: number): KaraokeFrame[] {
  if (!sched.sung.length) return [];
  const n = Math.max(2, Math.ceil(sched.end * fps - 1e-9));
  const out: KaraokeFrame[] = Array.from({ length: n }, (_, i) => ({
    t: i / fps,
    ms: 1000 / fps,
    hold: false,
  }));
  out.push({ t: sched.end, ms: holdMs, hold: true });
  return out;
}

/** 一句的掃描進度：(t − 開始) ÷ 長度，限制在 0～1；長度 0 的句子一開始就整句變色 */
export function lineProgress(l: Pick<ScheduledLine, 'start' | 'length'>, t: number): number {
  if (l.length > 0) return Math.min(1, Math.max(0, (t - l.start) / l.length));
  return t >= l.start - 1e-9 ? 1 : 0;
}

export interface KaraokeShowPlan {
  /** 畫面上的行數 */
  rows: number;
  /** 每一行（lines 的索引）在第幾行顯示；不顯示的為 −1 */
  rowOf: number[];
  /** 實際的輪替淡化秒數（兩種固定 n 行以外為 0） */
  fade: number;
  /** t 秒時每一行（lines 的索引）的透明度 */
  alphaAt(t: number): number[];
}

const EPS = 1e-9;

/**
 * 「顯示哪些句子」：
 * - all：全部一直顯示；reveal：唱到才出現並保留；current：只顯示正在唱的一句（第一句從頭、最後一句保留到結束）；
 * - rotate：固定 n 行逐句輪替（第 k 句在第 k mod n 行，第 k 句在第 k − n 句唱完時接手）；
 * - page：固定 n 行整頁更換（一頁的最後一句唱完時換下一頁）。
 * 兩種固定 n 行：要離開的句子在唱完後 f 秒內淡出，接手的在那之後 f 秒內淡入（先出後進）；
 * f＝min(設定值, 最短可用時間 ÷ 3)。
 */
export function karaokeShowPlan(
  sched: LyricSchedule,
  show: KaraokeShow,
  n: number,
  swapFade: number,
): KaraokeShowPlan {
  const L = sched.lines;
  const S = sched.sung;
  const m = S.length;
  const endOf = (k: number) => L[S[k]].start + L[S[k]].length;
  const startOf = (k: number) => L[S[k]].start;

  if (show === 'all' || show === 'reveal' || show === 'current') {
    const rowOf = L.map((l, i) => (l.sung ? i : -1));
    return {
      rows: L.length,
      rowOf,
      fade: 0,
      alphaAt(t) {
        const out = L.map(() => 0);
        S.forEach((li, k) => {
          let on: boolean;
          if (show === 'all') on = true;
          else if (show === 'reveal') on = t >= startOf(k) - EPS;
          else on = (k === 0 || t >= startOf(k) - EPS) && (k === m - 1 || t < endOf(k) - EPS);
          out[li] = on ? 1 : 0;
        });
        return out;
      },
    };
  }

  const r = Math.max(0, Math.min(Math.max(1, Math.floor(n)), m));
  const rowOf = L.map(() => -1);
  S.forEach((li, k) => {
    rowOf[li] = r ? k % r : -1;
  });
  /* 每一句：何時開始淡出（null＝保留到結束）、何時可以進場（null＝一開始就在） */
  const leaveAt: (number | null)[] = [];
  const enterAfter: (number | null)[] = [];
  if (show === 'rotate') {
    for (let k = 0; k < m; k++) {
      leaveAt.push(k + r < m ? endOf(k) : null);
      enterAfter.push(k >= r ? endOf(k - r) : null);
    }
  } else {
    const pages = r ? Math.ceil(m / r) : 0;
    const pageEnd = (p: number) => endOf(Math.min(m, (p + 1) * r) - 1);
    for (let k = 0; k < m; k++) {
      const p = Math.floor(k / r);
      leaveAt.push(p < pages - 1 ? pageEnd(p) : null);
      enterAfter.push(p > 0 ? pageEnd(p - 1) : null);
    }
  }
  let minAvail = Number.POSITIVE_INFINITY;
  for (let k = 0; k < m; k++) {
    const e = enterAfter[k];
    if (e !== null) minAvail = Math.min(minAvail, endOf(k) - e);
  }
  const want = Math.max(0, swapFade);
  const f = Number.isFinite(minAvail) ? Math.max(0, Math.min(want, minAvail / 3)) : want;
  const fadeOut = (t: number, at: number) =>
    f > 0 ? Math.min(1, Math.max(0, 1 - (t - at) / f)) : t < at - EPS ? 1 : 0;
  const fadeIn = (t: number, after: number) =>
    f > 0 ? Math.min(1, Math.max(0, (t - after - f) / f)) : t >= after - EPS ? 1 : 0;
  return {
    rows: r,
    rowOf,
    fade: f,
    alphaAt(t) {
      const out = L.map(() => 0);
      S.forEach((li, k) => {
        const leave = leaveAt[k];
        const enter = enterAfter[k];
        const a =
          (enter === null ? 1 : fadeIn(t, enter)) * (leave === null ? 1 : fadeOut(t, leave));
        out[li] = Math.round(a * 1e9) / 1e9;
      });
      return out;
    },
  };
}
