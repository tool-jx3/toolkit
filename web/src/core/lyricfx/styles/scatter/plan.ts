/**
 * 「散落」的排位置（lyric-fx 規格 3.4、3.5）：依時間把每一句的開始當成一個事件，模擬畫面上有哪些句
 * （目前這一句、殘影、預點亮的槽位），照原作的步驟替每一句決定折行、位置、角度與時間。純函式。
 *
 * 長度一律以基準畫面計（短邊 1080：規格 3.1）。每一句的亂數只用自己的亂數流（hash(種子, 鍵, 重抽次數)），
 * 取用的順序同原作（先抽角度、再一次一次抽 x、y；安全帶的打亂鍵…）。
 */
import { fontCss } from '../../../fonts';
import type { JitterSpec } from '../../jitter';
import {
  IDENTITY_PERSPECTIVE,
  type Perspective,
  perspectiveAt,
  projectBox,
} from '../../perspective';
import { createRng, hash32, type Rng } from '../../random';
import type { LyricFxLine, LyricMeasureEnv, LyricSize } from '../../types';
import type { ScatterSettings } from './settings';

/** 字高＝字級 × 1.32（原作是字型的 ascent＋descent；微軟雅黑約 1.32 倍：規格 D11） */
export const TEXT_HEIGHT_RATIO = 1.32;
/** 行距＝0.3 × 字高 */
export const LINE_SPACING_RATIO = 0.3;
/** 中文樣式的影子邊 */
export const SHADOW_MARGIN = 6;
/** 影子的位移 */
export const SHADOW_OFFSET = 3;
/** 殘影、上飄每 30 ms 一次（原作的計時器） */
export const FADE_TICK = 0.03;
/** 暗態槽位的淡入時間與亮度 */
export const SLOT_FADE_IN = 0.4;
export const SLOT_DIM = 0.35;
/** 亮態槽位每個字的時間（ms） */
export const SLOT_REVEAL_MS = 50;
/** 沒有時間的歌詞、最後一句的打字間隔（ms） */
export const DEFAULT_CHAR_MS = 50;
/** 最快的打字間隔（ms） */
export const MIN_CHAR_MS = 30;
/** 自由放置每個角度試幾次、安全帶每條試幾次 */
const FREE_TRIES = 40;
const BAND_TRIES = 12;
const FREE_ANGLES = [0, 1, -1, 2, -2, 3, -3, 5, -5, 8, -8];
const BAND_ANGLES = [0, 1, -1, 2, -2, 3, -3];
/** 變窄的折行到這個寬度為止 */
const MIN_REFLOW_WIDTH = 160;

/** 每個字（相對錨點，透視前；基線再往下 th ÷ 3） */
export interface ScatterGlyph {
  ch: string;
  ox: number;
  oy: number;
}

/** 鎖定時記下的資料（座標是基準畫面的比例） */
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

/** 基準畫面：短邊 1080 */
export function baseFrame(size: LyricSize): { width: number; height: number; k: number } {
  const w = Math.max(1, size.width);
  const h = Math.max(1, size.height);
  const k = Math.min(w, h) / 1080;
  return { width: w / k, height: h / k, k };
}

/** 中英文樣式的判斷（規格 F28）：有中日韓字＝中文；只有 ASCII 字母＝英文；都沒有＝null */
export function detectLatin(text: string): boolean | null {
  let latin = false;
  for (const ch of text) {
    if (/\s/u.test(ch)) continue;
    const o = ch.codePointAt(0) ?? 0;
    if (
      (o >= 0x2e80 && o <= 0x9fff) ||
      (o >= 0xac00 && o <= 0xd7af) ||
      (o >= 0xf900 && o <= 0xfaff)
    )
      return false;
    if (o < 128 && /[A-Za-z]/.test(ch)) latin = true;
  }
  return latin ? true : null;
}

/** 字數（code point；原文＋翻譯時含中間的換行） */
export const charCount = (s: string): number => Array.from(s).length;

/**
 * 打字間隔（ms；規格 3.4，原作 lyric_window.py 1166-1179）。gapMs＝和下一句的間隔（沒有下一句＝null）。
 */
export function charInterval(
  gapMs: number | null,
  chars: number,
  s: Pick<ScatterSettings, 'marginTime' | 'maxInterval' | 'maxDuration'>,
): number {
  if (gapMs == null || chars <= 0) return DEFAULT_CHAR_MS;
  if (gapMs > s.maxInterval) return Math.max(MIN_CHAR_MS, Math.floor(s.maxDuration / chars));
  return Math.max(MIN_CHAR_MS, Math.floor((gapMs - s.marginTime) / chars));
}

/** 殘影在變成殘影後 Δ 秒的不透明度（0～255，≤ 0＝不畫） */
export const fadeAlpha = (fadeSpeed: number, dt: number): number =>
  255 - (fadeSpeed * dt) / FADE_TICK;
/** 殘影在 Δ 秒後往上飄了多少 px */
export const riseOffset = (riseSpeed: number, dt: number): number => (riseSpeed * dt) / FADE_TICK;
/** 殘影多久淡完（秒） */
export const fadeDuration = (fadeSpeed: number): number =>
  (255 * FADE_TICK) / Math.max(1e-9, fadeSpeed);

/* ---------- 量字與折行 ---------- */

interface Measurer {
  /** 一個字的寬 */
  adv(ch: string): number;
  /** 一行的寬（逐字相加＋字間距） */
  width(s: string): number;
}

function measurer(env: LyricMeasureEnv, font: string, spacing: number): Measurer {
  const cache = new Map<string, number>();
  const adv = (ch: string) => {
    let w = cache.get(ch);
    if (w === undefined) {
      w = env.advance(ch, font);
      cache.set(ch, w);
    }
    return w;
  };
  return {
    adv,
    width(s) {
      let w = 0;
      let n = 0;
      for (const ch of s) {
        w += adv(ch);
        n++;
      }
      return n ? w + (n - 1) * spacing : 0;
    },
  };
}

/** 折一段（沒有換行；規格 3.5「折行」，原作 lyric_window.py 348-412） */
function wrapPart(text: string, maxW: number, m: Measurer): string[] {
  if (!text) return [];
  if (maxW <= 0) return [text];
  if (m.width(text) <= maxW) return [text];
  const lines: string[] = [];
  if (text.trim().includes(' ')) {
    let current = '';
    for (const word of text.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (m.width(candidate) <= maxW) current = candidate;
      else {
        if (current) lines.push(current);
        if (m.width(word) > maxW) {
          let sub = '';
          for (const ch of word) {
            if (sub && m.width(sub + ch) > maxW) {
              lines.push(sub);
              sub = ch;
            } else sub += ch;
          }
          current = sub;
        } else current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  let current = '';
  for (const ch of text) {
    if (current && m.width(current + ch) > maxW) {
      lines.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) lines.push(current);
  return lines;
}

/** 一句的每一段（原文、翻譯）各自折行 */
const wrapParts = (text: string, maxW: number, m: Measurer): string[][] =>
  text
    .split('\n')
    .map((p) => wrapPart(p, maxW, m))
    .filter((r) => r.length > 0);

const wrapText = (text: string, maxW: number, m: Measurer): string[] =>
  wrapParts(text, maxW, m).flat();

/** 折成最多 n 行（變寬：每次 × 1.5 最多 6 次；還是太多行時同一段的最後幾行併起來，原文與翻譯不合併：D13） */
function wrapAtMost(n: number, text: string, maxW: number, m: Measurer): string[] {
  const target = Math.max(1, n);
  let w = maxW;
  let parts = wrapParts(text, w, m);
  let tries = 0;
  const count = () => parts.reduce((a, p) => a + p.length, 0);
  while (count() > target && tries < 6) {
    w = Math.floor(w * 1.5);
    parts = wrapParts(text, w, m);
    tries++;
  }
  for (let i = parts.length - 1; i >= 0 && count() > target; i--) {
    const p = parts[i];
    if (p.length <= 1) continue;
    const keep = Math.max(1, p.length - (count() - target));
    const sep = text.split('\n').filter(Boolean)[i]?.trim().includes(' ') ? ' ' : '';
    parts[i] = [...p.slice(0, keep - 1), p.slice(keep - 1).join(sep)];
  }
  return parts.flat();
}

/** 改折行的候選（規格 3.5「改折行」，原作 lyric_window.py 748-797）：先變寬、再變窄，不重複 */
function* reflowVariants(rows: string[], text: string, maxW: number, m: Measurer) {
  const seen = new Set([rows.join('\n')]);
  let n = rows.length;
  while (n >= 2) {
    n--;
    const vr = wrapAtMost(n, text, maxW, m);
    const k = vr.join('\n');
    if (vr.length && !seen.has(k)) {
      seen.add(k);
      yield vr;
    }
  }
  let w = maxW;
  while (w > MIN_REFLOW_WIDTH) {
    w = Math.floor(w / 1.5);
    const vr = wrapText(text, w, m);
    const k = vr.join('\n');
    if (vr.length && !seen.has(k)) {
      seen.add(k);
      yield vr;
    }
  }
}

/* ---------- 幾何 ---------- */

interface Env {
  W: number;
  H: number;
  th: number;
  ls: number;
  pad: number;
  B: number;
  px: number;
  py: number;
  ux0: number;
  ux1: number;
  uy0: number;
  uy1: number;
  amin: number;
  amax: number;
  maxW: number;
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  persp: boolean;
  strengthX: number;
  strengthY: number;
  comp: number;
  partition: boolean;
}

interface RowsInfo {
  rows: string[];
  /** 每一行最後一個字的游標、寬 */
  last: { cursor: number; adv: number }[];
  maxCursor: number;
}

function rowsInfo(rows: string[], m: Measurer): RowsInfo {
  const last = rows.map((r) => {
    const chars = Array.from(r);
    const a = chars.length ? m.adv(chars[chars.length - 1]) : 0;
    return { cursor: Math.max(0, m.width(r) - a), adv: a };
  });
  return { rows, last, maxCursor: last.reduce((a, l) => Math.max(a, l.cursor), 0) };
}

interface Extent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 以錨點為原點的整塊範圍（實際的斜排：規格 3.5、D1） */
function extent(info: RowsInfo, angle: number, e: Env): Extent {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.sin(rad);
  let right = 0;
  for (const l of info.last) right = Math.max(right, l.cursor * cos + l.adv);
  const up = Math.max(0, -info.maxCursor * sin);
  const down = Math.max(0, info.maxCursor * sin);
  return {
    left: -e.pad,
    right: right + e.pad,
    top: -e.th - e.pad - up,
    bottom: -e.th + info.rows.length * (e.th + e.ls) + down + e.pad,
  };
}

const boxAt = (x: number, y: number, ex: Extent): ScatterBox => ({
  x: x + ex.left,
  y: y + ex.top,
  width: ex.right - ex.left,
  height: ex.bottom - ex.top,
});

const overlaps = (a: ScatterBox, b: ScatterBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

type Range = [x0: number, x1: number, y0: number, y1: number];

/** 錨點的範圍（規格 3.5「錨點的範圍」） */
function anchorRange(ex: Extent, index: number, e: Env): Range {
  const xLo = Math.ceil(e.B + e.px - ex.left);
  const xHi = Math.floor(e.W - e.B - e.px - ex.right);
  const yLo = Math.ceil(e.B + e.py - ex.top);
  const yHi = Math.floor(e.H - e.B - e.py - ex.bottom);
  let x0 = xLo;
  let x1 = xHi;
  let y0 = yLo;
  let y1 = yHi;
  if (!e.region) {
    x0 = Math.max(e.ux0, xLo);
    x1 = Math.min(e.ux1, xHi);
    y0 = Math.max(e.uy0, yLo);
    y1 = Math.min(e.uy1, yHi);
  }
  if (x1 < x0) {
    x0 = xLo;
    x1 = xHi;
    if (x1 < x0) x0 = x1 = Math.round((xLo + xHi) / 2);
  }
  if (y1 < y0) {
    y0 = yLo;
    y1 = yHi;
    if (y1 < y0) y0 = y1 = Math.round((yLo + yHi) / 2);
  }
  if (e.partition) {
    const mid = (x0 + x1) / 2;
    if (index % 2 === 0) {
      const h = Math.floor(mid);
      if (h >= x0) x1 = h;
    } else {
      const h = Math.ceil(mid);
      if (h <= x1) x0 = h;
    }
  }
  return [x0, x1, y0, y1];
}

/** 整塊在避開區域四側時錨點可以在的帶子（規格 3.5「安全帶」，原作 lyric_window.py 525-564） */
function safeBands(r: Range, ex: Extent, e: Env): Range[] {
  const [x0, x1, y0, y1] = r;
  if (!e.region) return [r];
  const R = e.region;
  const bands: Range[] = [];
  let b = Math.floor(R.y0 - 1 - ex.bottom);
  if (y0 < b) bands.push([x0, x1, y0, Math.min(y1, b)]);
  b = Math.ceil(R.y1 + 1 - ex.top);
  if (b < y1) bands.push([x0, x1, Math.max(y0, b), y1]);
  b = Math.floor(R.x0 - 1 - ex.right);
  if (x0 < b) bands.push([x0, Math.min(x1, b), y0, y1]);
  b = Math.ceil(R.x1 + 1 - ex.left);
  if (b < x1) bands.push([Math.max(x0, b), x1, y0, y1]);
  const area = (q: Range) => (q[1] - q[0]) * (q[3] - q[2]);
  return bands.filter((q) => q[1] > q[0] && q[3] > q[2]).sort((a, c) => area(c) - area(a));
}

/* ---------- 放置 ---------- */

interface Attempt {
  placed: boolean;
  fallback: boolean;
  x: number;
  y: number;
  angle: number;
}

type Collides = (box: ScatterBox, x: number, y: number, angle: number) => boolean;

function angleList(rng: Rng, e: Env, extra: readonly number[]): number[] {
  const list = [rng.randint(e.amin, e.amax)];
  for (const a of extra) if (a >= e.amin && a <= e.amax && !list.includes(a)) list.push(a);
  return list;
}

/** 沒有避開區域：自由放置（原作 lyric_window.py 680-700） */
function placeFree(info: RowsInfo, index: number, rng: Rng, e: Env, collides: Collides): Attempt {
  const angles = angleList(rng, e, FREE_ANGLES);
  for (const angle of angles) {
    const ex = extent(info, angle, e);
    const [x0, x1, y0, y1] = anchorRange(ex, index, e);
    for (let i = 0; i < FREE_TRIES; i++) {
      const x = rng.randint(x0, x1);
      const y = rng.randint(y0, y1);
      if (!collides(boxAt(x, y, ex), x, y, angle))
        return { placed: true, fallback: false, x, y, angle };
    }
  }
  const ex = extent(info, angles[0], e);
  const [x0, x1, y0, y1] = anchorRange(ex, index, e);
  return {
    placed: false,
    fallback: true,
    x: rng.randint(x0, x1),
    y: rng.randint(y0, y1),
    angle: angles[0],
  };
}

/** 有避開區域：安全帶（原作 lyric_window.py 702-746） */
function placeInBands(
  info: RowsInfo,
  index: number,
  rng: Rng,
  e: Env,
  collides: Collides,
): Attempt {
  const angles = angleList(rng, e, BAND_ANGLES);
  let fb: { x: number; y: number; angle: number } | null = null;
  for (const angle of angles) {
    const ex = extent(info, angle, e);
    const safe = safeBands(anchorRange(ex, index, e), ex, e);
    if (!safe.length) continue;
    const keyed = safe.map((b) => ({
      b,
      k: rng.random() ** (1 / Math.max((b[1] - b[0]) * (b[3] - b[2]), 1)),
    }));
    keyed.sort((p, q) => q.k - p.k);
    for (const { b } of keyed) {
      const [bx0, bx1, by0, by1] = b;
      if (bx1 <= bx0 || by1 <= by0) continue;
      for (let i = 0; i < BAND_TRIES; i++) {
        const x = rng.randint(bx0, bx1);
        const y = rng.randint(by0, by1);
        fb ??= { x, y, angle };
        if (!collides(boxAt(x, y, ex), x, y, angle))
          return { placed: true, fallback: false, x, y, angle };
      }
    }
  }
  if (fb) return { placed: false, fallback: true, ...fb };
  return { placed: false, fallback: false, x: 0, y: 0, angle: 0 };
}

/** 推出避開區域（原作 lyric_window.py 798-835） */
function pushOut(info: RowsInfo, index: number, rng: Rng, e: Env): Attempt {
  const angle = rng.randint(e.amin, e.amax);
  const ex = extent(info, angle, e);
  const [x0, x1, y0, y1] = anchorRange(ex, index, e);
  const x = Math.floor((x0 + x1) / 2);
  const y = Math.floor((y0 + y1) / 2);
  const R = e.region;
  if (!R || !info.rows.length) return { placed: false, fallback: true, x, y, angle };
  const rect = { x: R.x0, y: R.y0, width: R.x1 - R.x0, height: R.y1 - R.y0 };
  const hits = (px: number, py: number) => overlaps(boxAt(px, py, ex), rect);
  if (!hits(x, y)) return { placed: false, fallback: true, x, y, angle };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const cands: [number, number][] = [
    [x, clamp(Math.floor(R.y0 - 1 - ex.bottom), y0, y1)],
    [x, clamp(Math.ceil(R.y1 + 1 - ex.top), y0, y1)],
    [clamp(Math.floor(R.x0 - 1 - ex.right), x0, x1), y],
    [clamp(Math.ceil(R.x1 + 1 - ex.left), x0, x1), y],
  ];
  const ok = cands
    .filter(([cx, cy]) => !hits(cx, cy))
    .map(([cx, cy]) => ({ d: Math.abs(cx - x) + Math.abs(cy - y), cx, cy }))
    .sort((a, b) => a.d - b.d || a.cx - b.cx || a.cy - b.cy);
  if (ok.length) return { placed: false, fallback: true, x: ok[0].cx, y: ok[0].cy, angle };
  return { placed: false, fallback: true, x, y, angle };
}

/* ---------- 主程式 ---------- */

interface Placement {
  rows: string[];
  x: number;
  y: number;
  angle: number;
  overlapped: boolean;
  locked: boolean;
}

function validLock(lock: unknown, text: string): ScatterLock | null {
  if (!lock || typeof lock !== 'object') return null;
  const o = lock as Record<string, unknown>;
  if (
    typeof o.fx !== 'number' ||
    typeof o.fy !== 'number' ||
    typeof o.angle !== 'number' ||
    !Array.isArray(o.rows) ||
    !o.rows.every((r) => typeof r === 'string') ||
    ![o.fx, o.fy, o.angle].every(Number.isFinite)
  )
    return null;
  const rows = o.rows as string[];
  const squash = (s: string) => s.replace(/\s+/gu, '');
  if (squash(rows.join('')) !== squash(text)) return null;
  return { fx: o.fx, fy: o.fy, angle: o.angle, rows };
}

export function planScatter(
  input: readonly LyricFxLine[],
  s: ScatterSettings,
  seed: number,
  size: LyricSize,
  envMeasure: LyricMeasureEnv,
): ScatterPlan {
  const { width: W, height: H } = baseFrame(size);
  const th = s.fontSize * TEXT_HEIGHT_RATIO;
  const ls = th * LINE_SPACING_RATIO;
  const glowM = s.glow ? s.glowSize + 4 : 4;
  const pad = glowM + SHADOW_MARGIN;
  const B = Math.max(30, Math.floor(Math.sqrt(W * W + H * H) * 0.03));
  const strengthX = s.perspX * 1e-6;
  const strengthY = s.perspY * 1e-5;
  const comp = s.perspComp * 0.01;
  const px = s.perspective ? Math.floor(W * Math.max(Math.abs(strengthX), 0.001) * 2) : 0;
  const py = s.perspective ? Math.floor(H * Math.max(Math.abs(strengthY), 0.001) * 2) : 0;
  const amin = Math.min(s.angleMin, s.angleMax);
  const amax = Math.max(s.angleMin, s.angleMax);
  const maxA = (Math.max(Math.abs(amin), Math.abs(amax), 1) * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(maxA)) || 0.01;
  const sinA = Math.abs(Math.sin(maxA));
  /* 一行最多多寬（原作 lyric_window.py 473-507） */
  let a = W - 2 * (B + glowM + SHADOW_MARGIN + px);
  a = (a - 3 * th * sinA) / cosA;
  if (s.perspective) a /= 1 + comp;
  a -= Math.floor(a * 0.05) + Math.floor(th / 2);
  let cap = Math.floor(W * 0.78);
  if (s.perspective) cap = Math.floor(cap / (1 + comp));
  const maxW = Math.max(Math.min(Math.floor(a), cap), 120);
  const reg = s.region
    ? {
        x0: Math.round(s.region.x * W),
        y0: Math.round(s.region.y * H),
        x1: Math.round((s.region.x + s.region.width) * W),
        y1: Math.round((s.region.y + s.region.height) * H),
      }
    : null;
  const e: Env = {
    W,
    H,
    th,
    ls,
    pad,
    B,
    px,
    py,
    ux0: Math.floor((W * s.posXMin) / 100),
    ux1: Math.floor((W * s.posXMax) / 100),
    uy0: Math.floor((H * s.posYMin) / 100),
    uy1: Math.floor((H * s.posYMax) / 100),
    amin,
    amax,
    maxW,
    region: reg,
    persp: s.perspective,
    strengthX,
    strengthY,
    comp,
    partition: s.partition,
  };
  const regionRect = reg
    ? { x: reg.x0, y: reg.y0, width: reg.x1 - reg.x0, height: reg.y1 - reg.y0 }
    : null;
  const perspFor = (x: number, y: number): Perspective =>
    s.perspective ? perspectiveAt(x, y, W, H, strengthX, strengthY, comp) : IDENTITY_PERSPECTIVE;
  /** 透視後的整塊不壓到避開區域（D2） */
  const hitsRegionAfterPersp = (box: ScatterBox, x: number, y: number) =>
    !!regionRect && s.perspective && overlaps(projectBox(perspFor(x, y), box), regionRect);

  const lines = [...input].sort((p, q) => p.t - q.t);
  const preview = lines.some((l) => l.tr) ? 0 : s.preview;
  const fadePerSecond = s.fadeSpeed / FADE_TICK;
  const risePerSecond = s.riseSpeed / FADE_TICK;
  const fadeLen = fadeDuration(s.fadeSpeed);
  const out: ScatterLinePlan[] = [];

  /* 目前畫面上的句：殘影（含開始淡出的時間）、槽位、目前這一句 */
  const fading: ScatterLinePlan[] = [];
  const slots = new Map<number, ScatterLinePlan>();
  let current: ScatterLinePlan | null = null;

  const measureFor = (latin: boolean) => {
    const f = latin && s.latinFont ? s.latinFont : s.font;
    const css = fontCss(f, s.fontSize);
    return { css, m: measurer(envMeasure, css, s.spacing) };
  };
  const mCjk = measureFor(false);
  const mLatin = s.latinFont ? measureFor(true) : mCjk;

  const boxAtTime = (p: ScatterLinePlan, t: number): ScatterBox => {
    if (t <= p.fadeStart) return p.box;
    const dy = riseOffset(s.riseSpeed, t - p.fadeStart);
    return { ...p.box, y: p.box.y - dy };
  };
  const fadingBoxes = (t: number) =>
    fading.filter((p) => p.fadeStart <= t && t < p.fadeEnd).map((p) => boxAtTime(p, t));

  /** 依折行、位置、角度做出一句的排法 */
  const build = (
    line: LyricFxLine,
    index: number,
    latin: boolean,
    pl: Placement,
    font: string,
    m: Measurer,
  ): ScatterLinePlan => {
    const rad = (pl.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const glyphs: ScatterGlyph[] = [];
    pl.rows.forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        glyphs.push({ ch, ox: c * cos, oy: c * sin + r * (th + ls) });
        c += m.adv(ch) + s.spacing;
      }
    });
    const ex = extent(rowsInfo(pl.rows, m), pl.angle, e);
    return {
      key: line.key,
      index,
      rows: pl.rows,
      glyphs,
      latin,
      font,
      x: pl.x,
      y: pl.y,
      angle: pl.angle,
      persp: perspFor(pl.x, pl.y),
      box: boxAt(pl.x, pl.y, ex),
      start: line.t,
      interval: DEFAULT_CHAR_MS,
      bright: false,
      slotBorn: null,
      slotBright: false,
      fadeStart: Number.POSITIVE_INFINITY,
      fadeEnd: Number.POSITIVE_INFINITY,
      jitter: {
        start: line.t,
        period: s.shakeSpeed / 1000,
        firstTick: 1,
        intensity: s.shakeIntensity,
        lineHash: 0,
      },
      overlapped: pl.overlapped,
      locked: pl.locked,
    };
  };

  /** 放一句（目前這一句或槽位）：鎖定的直接用 */
  const place = (line: LyricFxLine, index: number, asSlot: boolean, t: number): ScatterLinePlan => {
    const display = line.tr ? `${line.text}\n${line.tr}` : line.text;
    const mode = s.mode === 'auto' ? (detectLatin(display) ?? false) : s.mode === 'latin';
    const { css, m } = mode ? mLatin : mCjk;
    const lock = validLock(line.lock, display);
    if (lock) {
      return build(
        line,
        index,
        mode,
        {
          rows: lock.rows,
          x: Math.round(lock.fx * W),
          y: Math.round(lock.fy * H),
          angle: Math.round(lock.angle),
          overlapped: false,
          locked: true,
        },
        css,
        m,
      );
    }
    const rng = createRng(hash32(seed >>> 0, line.key, line.reroll));
    const rows0 = wrapText(display, maxW, m);
    const occupants: ScatterBox[] = [...fadingBoxes(t)];
    for (const sp of slots.values()) occupants.push(sp.box);
    if (asSlot && current) occupants.push(current.box);
    const collides: Collides = (box, x, y) =>
      occupants.some((o) => overlaps(box, o)) || hitsRegionAfterPersp(box, x, y);
    const info0 = rowsInfo(rows0, m);
    let rows = rows0;
    let r: Attempt;
    if (!reg) {
      r = placeFree(info0, index, rng, e, collides);
      if (!r.placed) {
        for (const v of reflowVariants(rows0, display, maxW, m)) {
          rows = v;
          r = placeFree(rowsInfo(v, m), index, rng, e, collides);
          if (r.placed) break;
        }
      }
    } else {
      r = placeInBands(info0, index, rng, e, collides);
      if (!r.placed && !r.fallback) {
        for (const v of reflowVariants(rows0, display, maxW, m)) {
          const rv = placeInBands(rowsInfo(v, m), index, rng, e, collides);
          if (asSlot) {
            rows = v;
            r = rv;
          }
          if (rv.placed) {
            rows = v;
            r = rv;
            break;
          }
        }
      }
      if (!r.placed && !r.fallback) {
        if (asSlot) {
          const ex = extent(rowsInfo(rows, m), amin, e);
          const [x0, x1, y0, y1] = anchorRange(ex, index, e);
          r = {
            placed: false,
            fallback: true,
            x: rng.randint(x0, x1),
            y: rng.randint(y0, y1),
            angle: amin,
          };
        } else {
          rows = rows0;
          r = pushOut(info0, index, rng, e);
        }
      }
    }
    return build(
      line,
      index,
      mode,
      { rows, x: r.x, y: r.y, angle: r.angle, overlapped: !r.placed, locked: false },
      css,
      m,
    );
  };

  /** 目前這一句在 fs 變成殘影（至少出現過一個字才有殘影） */
  const retire = (prev: ScatterLinePlan, fs: number) => {
    const shown = prev.bright || Math.floor(((fs - prev.start) * 1000) / prev.interval + 1e-9) >= 1;
    prev.fadeStart = fs;
    prev.fadeEnd = shown ? fs + fadeLen : fs;
    if (shown) fading.push(prev);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.t;
    /* ① 前一句變成殘影 */
    if (current) {
      retire(current, Math.min(t, lines[current.index].end));
      current = null;
    }
    /* ② 拿掉淡完的殘影 */
    for (let j = fading.length - 1; j >= 0; j--) if (fading[j].fadeEnd <= t) fading.splice(j, 1);
    /* ③ 這一句：有槽位就用槽位 */
    const slot = slots.get(i);
    for (const k of [...slots.keys()]) if (k <= i) slots.delete(k);
    const p = slot ?? place(line, i, false, t);
    const next = lines[i + 1];
    const chars = charCount(line.tr ? `${line.text}\n${line.tr}` : line.text);
    p.interval = line.untimed
      ? DEFAULT_CHAR_MS
      : charInterval(next ? Math.round((next.t - t) * 1000) : null, chars, s);
    p.start = t;
    p.bright = !!slot && slot.slotBright;
    p.jitter = {
      start: t,
      period: s.shakeSpeed / 1000,
      firstTick: p.bright ? 1 : Math.max(1, Math.ceil(p.interval / s.shakeSpeed - 1e-9)),
      intensity: s.shakeIntensity,
      lineHash: hash32(seed >>> 0, line.key, line.reroll, 'jitter'),
    };
    if (!slot) out.push(p);
    current = p;
    /* ④ 補齊槽位 */
    if (preview > 0) {
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + preview); j++) {
        if (slots.has(j)) continue;
        const sp = place(lines[j], j, true, t);
        sp.slotBorn = t;
        sp.slotBright = !s.keepDim;
        slots.set(j, sp);
        out.push(sp);
      }
    }
  }
  /* 最後一句：有結束時間（SRT、空白的時間標籤）時照樣變成殘影 */
  if (current) {
    const end = lines[current.index].end;
    if (Number.isFinite(end)) retire(current, Math.max(current.start, end));
  }
  out.sort((p, q) => p.index - q.index);
  return {
    width: W,
    height: H,
    th,
    lines: out,
    byKey: new Map(out.map((p) => [p.key, p])),
    fadePerSecond,
    risePerSecond,
    preview,
  };
}

/** 鎖定一句時記下的資料（規格 F12） */
export function scatterLock(plan: ScatterPlan, key: string): ScatterLock | null {
  const p = plan.byKey.get(key);
  if (!p) return null;
  return { fx: p.x / plan.width, fy: p.y / plan.height, angle: p.angle, rows: [...p.rows] };
}
