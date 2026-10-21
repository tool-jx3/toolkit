/**
 * 「散落」的 plan（lyric-fx 規格 3.3～3.5、3.7）：事先把每一句的時間、位置、角度、折行、透視與抖動排好（純函式）。
 *
 * - 時間：打字間隔、殘影的開始與結束、槽位（預點亮）都只看歌詞的時間（規格 3.4），先算好。
 * - 位置：依開始時間逐句模擬畫面上有哪些句（目前這一句、殘影、槽位），每一句用自己的亂數流找位置（規格 3.5、3.7）；
 *   排版（折行、斜排、範圍）在 layout.ts，找位置在 search.ts。
 * - 鎖定的句（F12）用記下的位置、角度與折行：照比例換算到這個畫面後夾回畫面內，放不進畫面時改用新的折行。
 * - 殘影、打字、槽位的時間函式（fadeAlpha 等）也在這裡，draw.ts 用它們畫任一時間的一格。
 */
import { fontCss } from '../../../fonts';
import type { JitterSpec } from '../../jitter';
import { IDENTITY_PERSPECTIVE, type Perspective, perspectiveAt } from '../../perspective';
import { createRng, hash32 } from '../../random';
import type {
  LyricFxLine,
  LyricMeasureEnv,
  LyricPlanOptions,
  LyricRegion,
  LyricSize,
} from '../../types';
import {
  anchorSpan,
  boxAt,
  type Metrics,
  metricsFor,
  type Ruler,
  rewraps,
  rowsMatch,
  rowsOf,
  rulerFor,
  type Shape,
  type Side,
  screenSpan,
  segmentsOf,
  shapeOf,
  type Wrapping,
  wrapAll,
} from './layout';
import {
  anywhere,
  bandSearch,
  escapeRegion,
  type Rect,
  type SearchContext,
  type Spot,
  scatterSearch,
  type Zone,
} from './search';
import type { ScatterSettings } from './settings';

/* ---------- 常數（規格 3.3～3.6） ---------- */

/** 字高 ÷ 字級（D11）、行距 ÷ 字高、影子邊（px） */
export { LINE_SPACING_RATIO, SHADOW_MARGIN, TEXT_HEIGHT_RATIO } from './layout';
/** 中文樣式的影子往右下偏移（px） */
export const SHADOW_OFFSET = 3;
/** 殘影的一次更新（秒）：淡出速度、上升速度都是「每 30 ms」 */
export const FADE_TICK = 0.03;
/** 暗態槽位淡入的時間（秒）與亮度 */
export const SLOT_FADE_IN = 0.4;
export const SLOT_DIM = 0.35;
/** 亮態槽位每個字的間隔（ms） */
export const SLOT_REVEAL_MS = 50;
/** 最後一句、沒有時間的歌詞的打字間隔（ms） */
export const DEFAULT_CHAR_MS = 50;
/** 打字間隔的下限（ms） */
export const MIN_CHAR_MS = 30;

/** 殘影的起始不透明度 */
const FULL_ALPHA = 255;

/* ---------- 型別 ---------- */

export interface ScatterGlyph {
  ch: string;
  ox: number;
  oy: number;
  /** 前進寬度（透視的局部近似以字的中心為準：draw.ts；沒有時當成 0） */
  adv?: number;
}

export interface ScatterLock {
  fx: number;
  fy: number;
  angle: number;
  rows: string[];
}

export interface ScatterBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScatterLinePlan {
  key: string;
  index: number;
  rows: string[];
  glyphs: ScatterGlyph[];
  /** 英文樣式 */
  latin: boolean;
  /** canvas 的 font */
  font: string;
  x: number;
  y: number;
  angle: number;
  persp: Perspective;
  /** 透視前的整塊（基準畫面座標，含 pad） */
  box: ScatterBox;
  /** 開始（秒） */
  start: number;
  /** 打字間隔（ms） */
  interval: number;
  /** 由亮態槽位點亮：一開始就整句 */
  bright: boolean;
  /** 槽位出現的時間（沒有槽位＝null） */
  slotBorn: number | null;
  /** 槽位是亮態（逐字打出、正常亮度） */
  slotBright: boolean;
  /** 變成殘影的時間；沒有殘影時 fadeEnd ≤ fadeStart */
  fadeStart: number;
  fadeEnd: number;
  jitter: JitterSpec;
  /** 用了允許重疊的備用位置 */
  overlapped: boolean;
  /** 用鎖定的位置 */
  locked: boolean;
}

export interface ScatterPlan {
  /** 基準畫面 */
  width: number;
  height: number;
  /** 字高 */
  th: number;
  lines: ScatterLinePlan[];
  byKey: Map<string, ScatterLinePlan>;
  /** 殘影每秒減少的不透明度（0～255）、每秒上升的 px */
  fadePerSecond: number;
  risePerSecond: number;
  /** 實際用的預點亮句數 */
  preview: number;
}

/* ---------- 基準畫面、樣式、字數 ---------- */

/** 基準畫面（規格 3.1）：短邊 1080；k＝輸出 ÷ 基準 */
export function baseFrame(size: LyricSize): { width: number; height: number; k: number } {
  const w = size.width > 0 ? size.width : 1920;
  const h = size.height > 0 ? size.height : 1080;
  const short = Math.min(w, h);
  return { width: (w * 1080) / short, height: (h * 1080) / short, k: short / 1080 };
}

const CJK = /[⺀-鿿가-힯豈-﫿]/u;
const ASCII_LETTER = /[A-Za-z]/;

/** 中英文樣式（F28）：有中日韓字＝false（中文）；沒有中日韓字、有 ASCII 英文字母＝true（英文）；都沒有＝null */
export function detectLatin(text: string): boolean | null {
  if (CJK.test(text)) return false;
  return ASCII_LETTER.test(text) ? true : null;
}

/** 字數（以碼點計） */
export const charCount = (s: string): number => Array.from(s).length;

/* ---------- 時間（規格 3.3、3.4） ---------- */

/** 去掉浮點誤差（秒相減再 × 1000 時，例 5999.999999 → 6000） */
const clean = (ms: number): number => Math.round(ms * 1e6) / 1e6;

/**
 * 打字間隔（ms；規格 3.4）：gapMs＝和下一句的間隔（最後一句＝null）、chars＝字數。
 * 超過長間隔閾值：長間隔時長 ÷ 字數；否則（間隔 − 留白）÷ 字數；都無條件捨去、最少 30。最後一句、沒有字：50。
 */
export function charInterval(
  gapMs: number | null,
  chars: number,
  s: Pick<ScatterSettings, 'marginTime' | 'maxInterval' | 'maxDuration'>,
): number {
  if (gapMs == null || !Number.isFinite(gapMs) || chars <= 0) return DEFAULT_CHAR_MS;
  const budget = gapMs > s.maxInterval ? s.maxDuration : gapMs - s.marginTime;
  return Math.max(MIN_CHAR_MS, Math.floor(budget / chars));
}

/** 殘影 Δ 秒後的不透明度（0～255；≤ 0 時不畫）：每 30 ms 減淡出速度，格點之間線性內插 */
export const fadeAlpha = (fadeSpeed: number, dt: number): number =>
  FULL_ALPHA - (fadeSpeed * dt) / FADE_TICK;

/** 殘影 Δ 秒後往上飄的 px */
export const riseOffset = (riseSpeed: number, dt: number): number => (riseSpeed * dt) / FADE_TICK;

/** 殘影多久淡完（秒） */
export const fadeDuration = (fadeSpeed: number): number =>
  (FULL_ALPHA * FADE_TICK) / Math.max(fadeSpeed, 1e-9);

/** 每一句的時間（和位置無關） */
interface Timing {
  start: number;
  interval: number;
  slotBorn: number | null;
  bright: boolean;
  fadeStart: number;
  fadeEnd: number;
  /** 有殘影（變成殘影時至少已經出現一個字，或是亮態槽位點亮的） */
  fades: boolean;
}

/** 預點亮的句數（F47）：有翻譯而且一起顯示時不預點亮 */
const previewCount = (input: readonly LyricFxLine[], s: ScatterSettings): number =>
  input.some((l) => l.tr) ? 0 : s.preview;

function timingsOf(input: readonly LyricFxLine[], s: ScatterSettings, slots: number): Timing[] {
  const n = input.length;
  /* 第 i 句開始時補齊第 i＋1～i＋N 句的槽位：第 k 句（k ≥ 1）的槽位在第 max(0, k − N) 句開始時出現 */
  const born = (k: number) => (slots > 0 && k > 0 ? input[Math.max(0, k - slots)].t : null);
  return input.map((line, i) => {
    const next = i + 1 < n ? input[i + 1].t : null;
    const chars = charCount(line.text) + (line.tr ? 1 + charCount(line.tr) : 0);
    const interval = line.untimed
      ? DEFAULT_CHAR_MS
      : charInterval(next == null ? null : clean((next - line.t) * 1000), chars, s);
    const slotBorn = born(i);
    const bright = slotBorn != null && !s.keepDim;
    const fadeStart = Math.min(next ?? Number.POSITIVE_INFINITY, line.end);
    const shown = Math.floor(clean(((fadeStart - line.t) * 1000) / interval) + 1e-9);
    const fades = bright || shown >= 1;
    return {
      start: line.t,
      interval,
      slotBorn,
      bright,
      fadeStart,
      fadeEnd: fades ? fadeStart + fadeDuration(s.fadeSpeed) : fadeStart,
      fades,
    };
  });
}

/* ---------- 一句的排版資料 ---------- */

interface Draft {
  line: LyricFxLine;
  latin: boolean;
  font: string;
  ruler: Ruler;
  segments: string[];
  /** 照一行最多多寬折好的 */
  wrapping: Wrapping;
  /** 每種折行 × 角度的樣子（找位置時重複用） */
  shapes: Map<string, Shape>;
}

function draftOf(line: LyricFxLine, s: ScatterSettings, m: Metrics, env: LyricMeasureEnv): Draft {
  const latin =
    s.mode === 'latin'
      ? true
      : s.mode === 'cjk'
        ? false
        : detectLatin(line.text + line.tr) === true;
  const face = latin && s.latinFont ? s.latinFont : s.font;
  const font = fontCss(face, s.fontSize);
  const ruler = rulerFor(env, font, s.spacing);
  const segments = segmentsOf(line.text, line.tr);
  return {
    line,
    latin,
    font,
    ruler,
    segments,
    wrapping: wrapAll(segments, m.rowMax, ruler),
    shapes: new Map(),
  };
}

function shapeFor(d: Draft, m: Metrics, rows: readonly string[], angle: number): Shape {
  const k = `${angle}\n${rows.join('\n')}`;
  let hit = d.shapes.get(k);
  if (!hit) {
    hit = shapeOf(rows, angle, d.ruler, m);
    d.shapes.set(k, hit);
  }
  return hit;
}

/* ---------- 鎖定（F12） ---------- */

function readLock(v: unknown): ScatterLock | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (!ok(o.fx) || !ok(o.fy) || !ok(o.angle)) return null;
  if (!Array.isArray(o.rows) || !o.rows.length || !o.rows.every((r) => typeof r === 'string'))
    return null;
  return { fx: o.fx, fy: o.fy, angle: o.angle, rows: o.rows as string[] };
}

/**
 * 鎖定的位置：記下的比例換算到這個畫面、夾回畫面內（錨點的範圍不含出現範圍）；
 * 記下的折行放不進這個畫面（範圍是空的）時改用照一行最多多寬折好的，還是放不進就固定在最小值。
 */
function lockedSpot(d: Draft, m: Metrics, lock: ScatterLock): Spot {
  const fits = (sh: Shape) => {
    const span = screenSpan(sh.ext, m);
    return span.x.lo <= span.x.hi && span.y.lo <= span.y.hi;
  };
  let shape = shapeFor(d, m, lock.rows, lock.angle);
  if (!fits(shape)) shape = shapeFor(d, m, rowsOf(d.wrapping), lock.angle);
  const span = anchorSpan(shape.ext, m, false, null);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    shape,
    x: clamp(Math.round(lock.fx * m.W), span.x.lo, span.x.hi),
    y: clamp(Math.round(lock.fy * m.H), span.y.lo, span.y.hi),
  };
}

/* ---------- 放一句 ---------- */

type Role = 'current' | 'slot';

interface Placed {
  spot: Spot;
  overlapped: boolean;
  locked: boolean;
}

/**
 * 放一句（規格 3.5「放目前這一句」「放槽位」）：
 * - 沒有避開區域：自由放置；不行就逐一試改折行；都不行就用最後一次試的折行與它的備用點（允許重疊）。
 * - 有避開區域：安全帶（不行但有備用點就用備用點）；連帶子都沒有就逐一試改折行；
 *   還是沒有時，目前這一句推出區域、槽位在範圍內隨機（最小角）。
 */
function placeLine(ctx: SearchContext, d: Draft, zone: Zone | null, role: Role): Placed {
  const first = rowsOf(d.wrapping);
  const candidates = [first, ...rewraps(d.segments, d.wrapping, ctx.m.rowMax, d.ruler).map(rowsOf)];
  if (!zone) {
    let last: Spot | null = null;
    for (const rows of candidates) {
      const r = scatterSearch(ctx, rows);
      if (r.found) return { spot: r.found, overlapped: false, locked: false };
      last = r.fallback;
    }
    return { spot: last as Spot, overlapped: true, locked: false };
  }
  for (const rows of candidates) {
    const r = bandSearch(ctx, rows, zone);
    if (r.found) return { spot: r.found, overlapped: false, locked: false };
    if (r.backup) return { spot: r.backup, overlapped: true, locked: false };
  }
  const spot =
    role === 'current'
      ? escapeRegion(ctx, first, zone)
      : anywhere(ctx, candidates[candidates.length - 1]);
  return { spot, overlapped: true, locked: false };
}

/* ---------- plan ---------- */

const zoneOf = (r: LyricRegion | null | undefined, m: Metrics): Zone | null =>
  r && r.width > 0 && r.height > 0
    ? {
        left: Math.round(r.x * m.W),
        top: Math.round(r.y * m.H),
        right: Math.round((r.x + r.width) * m.W),
        bottom: Math.round((r.y + r.height) * m.H),
      }
    : null;

/**
 * 排好所有的句（規格 3.4、3.5）。input 依開始時間排好（buildLyricLines 的結果）；
 * options.region＝避開區域（工具層的共用設定，畫面的 0～1；規格 3.8）。
 */
export function planScatter(
  input: readonly LyricFxLine[],
  s: ScatterSettings,
  seed: number,
  size: LyricSize,
  envMeasure: LyricMeasureEnv,
  options: LyricPlanOptions = {},
): ScatterPlan {
  const frame = baseFrame(size);
  const m = metricsFor(s, frame.width, frame.height);
  const zone = zoneOf(options.region, m);
  const slots = previewCount(input, s);
  const times = timingsOf(input, s, slots);
  const drafts = input.map((line) => draftOf(line, s, m, envMeasure));
  const persp = (x: number, y: number): Perspective =>
    s.perspective
      ? perspectiveAt(x, y, m.W, m.H, s.perspX * 1e-6, s.perspY * 1e-5, s.perspComp * 0.01)
      : IDENTITY_PERSPECTIVE;

  const n = input.length;
  const placed: (Placed | null)[] = new Array(n).fill(null);
  const boxes: (Rect | null)[] = new Array(n).fill(null);

  const settle = (i: number, avoid: Rect[], role: Role) => {
    const d = drafts[i];
    const side: Side = s.partition ? (i % 2 === 0 ? 'left' : 'right') : null;
    const lock = readLock(d.line.lock);
    let p: Placed;
    if (lock && rowsMatch(lock.rows, d.line.text, d.line.tr))
      p = { spot: lockedSpot(d, m, lock), overlapped: false, locked: true };
    else {
      const h = hash32(seed, d.line.key, d.line.reroll);
      const ctx: SearchContext = {
        m,
        rng: createRng(h),
        avoid,
        side,
        shape: (rows, angle) => shapeFor(d, m, rows, angle),
        perspAt: persp,
      };
      p = placeLine(ctx, d, zone, role);
    }
    placed[i] = p;
    boxes[i] = boxAt(p.spot.shape.ext, p.spot.x, p.spot.y);
  };

  /* 依開始時間模擬（規格 3.5）：前一句變成殘影 → 拿掉淡完的殘影 → 這一句（有槽位就沿用）→ 補齊槽位 */
  for (let i = 0; i < n; i++) {
    const now = times[i].start;
    const fading: Rect[] = [];
    for (let j = 0; j < i; j++) {
      const tj = times[j];
      const b = boxes[j];
      if (!b || !tj.fades || tj.fadeStart > now || tj.fadeEnd <= now) continue;
      fading.push({ ...b, y: b.y - riseOffset(s.riseSpeed, now - tj.fadeStart) });
    }
    const waiting = (except: number) => {
      const out: Rect[] = [];
      for (let k = i + 1; k < n && k <= i + slots; k++) {
        const b = boxes[k];
        if (k !== except && b) out.push(b);
      }
      return out;
    };
    if (!placed[i]) settle(i, [...waiting(-1), ...fading], 'current');
    const current = boxes[i] as Rect;
    for (let k = i + 1; k < n && k <= i + slots; k++)
      if (!placed[k]) settle(k, [current, ...fading, ...waiting(k)], 'slot');
  }

  const lines: ScatterLinePlan[] = input.map((line, i) => {
    const t = times[i];
    const d = drafts[i];
    const p = placed[i] as Placed;
    const { shape, x, y } = p.spot;
    return {
      key: line.key,
      index: i,
      rows: shape.rows,
      glyphs: shape.glyphs.map((g) => ({ ch: g.ch, ox: g.ox, oy: g.oy, adv: g.adv })),
      latin: d.latin,
      font: d.font,
      x,
      y,
      angle: shape.angle,
      persp: persp(x, y),
      box: boxes[i] as Rect,
      start: t.start,
      interval: t.interval,
      bright: t.bright,
      slotBorn: t.slotBorn,
      slotBright: t.slotBorn != null && !s.keepDim,
      fadeStart: t.fadeStart,
      fadeEnd: t.fadeEnd,
      jitter: {
        start: t.start,
        period: s.shakeSpeed / 1000,
        firstTick: t.bright ? 1 : Math.max(1, Math.ceil(t.interval / s.shakeSpeed)),
        intensity: s.shakeIntensity,
        lineHash: hash32(seed, line.key, line.reroll),
      },
      overlapped: p.overlapped,
      locked: p.locked,
    };
  });

  return {
    width: m.W,
    height: m.H,
    th: m.th,
    lines,
    byKey: new Map(lines.map((l) => [l.key, l])),
    fadePerSecond: s.fadeSpeed / FADE_TICK,
    risePerSecond: s.riseSpeed / FADE_TICK,
    preview: slots,
  };
}

/** 鎖定一句時記下的資料（F12）：錨點在畫面的比例、角度、折行；這一句沒有排到時 null */
export function scatterLock(plan: ScatterPlan, key: string): ScatterLock | null {
  const p = plan.byKey.get(key);
  if (!p) return null;
  return { fx: p.x / plan.width, fy: p.y / plan.height, angle: p.angle, rows: [...p.rows] };
}
