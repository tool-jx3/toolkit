/**
 * 產生花紋（規格 3.2、3.3、3.11～3.14）：從中央圓開始，依加入的順序（廣度優先）一個一個圖形往外長線，
 * 線的末端放子圖形、加點，或不畫線直接貼著放子圖形。
 * 亂數的取用順序與浮點數的算法都照原作（al1scut/tkmizGeo edb6828）：差一點點就會讓某個比較翻轉，後面整張圖都不同。
 * 純計算，不依賴 DOM（Worker 與主執行緒共用）。
 */
import type { Random } from '@/core/timeline/random';
import {
  layoutMorse,
  type MorseLayout,
  type MorseSeg,
  type MorseToken,
  morseTokens,
} from './morse';
import { seedRandom, subRandom } from './random';
import type { BloomConfig, ShapeKind, TriKind } from './settings';
import {
  type CircleIndex,
  gridIndex,
  linearIndex,
  linearSegments,
  lineIndex,
  type SegmentIndex,
} from './spatial';

/** 同心圓、圓＋半圓的一層 */
export interface BloomRing {
  r: number;
  /** 從 a0 開始、長 span 的弧（弧度；完整的圓是 0、2π） */
  a0: number;
  span: number;
  /** 摩斯環的符號（null＝實線；空陣列＝這一圈太短排不下，什麼都不畫） */
  segs: MorseSeg[] | null;
  /** 不畫（三角心換掉的最內層） */
  hidden?: boolean;
}

/** 三角形（原作 2026-10）：core＝三角心（換掉最內層）、ring＝三角環（內接在某一層） */
export interface BloomTriangle {
  mode: 'core' | 'ring';
  /** 頂點的角度（畫布的角度，不跟著圖形旋轉） */
  rot: number;
  /** 外接圓半徑（＝那一層的半徑） */
  R: number;
  fill: boolean;
}

/** 摩斯橋：圖形裡角度 a 的一條徑向短線，從半徑 r0 到 r1 */
export interface BloomBridge {
  a: number;
  r0: number;
  r1: number;
}

/** 中央圖形的意義（tkmiz 造語，3.14）：中心點的樣子 */
export type CoreStyle = 'big' | 'small' | 'none';

export interface BloomShape {
  x: number;
  y: number;
  /** 外接圓半徑 */
  r: number;
  /** 代（中央圓是 0） */
  depth: number;
  kind: ShapeKind;
  /** 旋轉角度（弧度） */
  rotation: number;
  accent: boolean;
  fill: boolean;
  /** 同心圓、圓＋半圓：每一層（由外而內） */
  rings?: BloomRing[];
  /** 半圓：有直徑（閉合） */
  closed?: boolean;
  /** 三角心、三角環 */
  tri?: BloomTriangle | null;
  /** 摩斯橋 */
  bridges?: BloomBridge[];
  /** 中央圖形的中心（沒有時：同心圓畫一般的中心點） */
  core?: CoreStyle;
  /** 不畫線、直接貼著父圖形放的 */
  attached?: boolean;
}

export interface BloomLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  accent: boolean;
  /** 連到子圖形的線（線的丟失只會丟這種） */
  child?: boolean;
  /** 丟失了：不畫，但照樣算在產生的資料裡（後面的線還是會避開它） */
  dropped?: boolean;
}

export interface BloomDot {
  x: number;
  y: number;
  r: number;
  accent: boolean;
}

export interface BloomScene {
  shapes: BloomShape[];
  lines: BloomLine[];
  dots: BloomDot[];
  /** 畫的順序（原作 2026-10 一邊產生一邊畫）：s＝下一個圖形、l＝下一條線、d＝下一個點 */
  order: string;
}

export interface BloomStats {
  shapes: number;
  /** 畫出來的線（丟失的不算） */
  lines: number;
  dropped: number;
  dots: number;
  bridges: number;
}

export function sceneStats(s: BloomScene): BloomStats {
  let dropped = 0;
  for (const l of s.lines) if (l.dropped) dropped++;
  let bridges = 0;
  for (const x of s.shapes) bridges += x.bridges?.length ?? 0;
  return {
    shapes: s.shapes.length,
    lines: s.lines.length - dropped,
    dropped,
    dots: s.dots.length,
    bridges,
  };
}

const TAU = Math.PI * 2;
/** 圓＋半圓的弧長：180°（兩份）、90°、270° */
const ARC_SPANS = [Math.PI, Math.PI, Math.PI / 2, Math.PI * 1.5] as const;
/** 「換角度重試」時每條線最多試 14 次 */
export const RETRY_LIMIT = 14;
/** 中央圖形「前進／伸長」的三條線：不是換角度重試時最多試 8 次 */
const MOTION_TRIES = 8;

const isFull = (g: BloomRing) => g.span >= TAU - 1e-6;
const normAngle = (a: number) => ((a % TAU) + TAU) % TAU;

/** 看得到的層（由外而內） */
export const visibleRings = (s: BloomShape): BloomRing[] =>
  s.rings ? s.rings.filter((g) => !g.hidden) : [];

/** 由內往外數第 k 層看得到的（不夠時是最外層） */
function innerRing(s: BloomShape, k: number): BloomRing {
  const list = visibleRings(s);
  return list[Math.max(0, list.length - k)];
}

/* ---------- 中央圖形的意義（tkmiz 造語，3.14） ---------- */

export interface RootMeaning {
  /** 說話中、介紹中：中央換成三角心 */
  state: 'speak' | '';
  /** 工作：最內層是實線（yes）或摩斯環（no） */
  work: 'yes' | 'no';
  /** 中心：大的實心圓、一般的中心點、沒有 */
  core: CoreStyle;
  /** 前進中（第一圈長出三條線）、伸長中（第二圈長出三條線）、沒有 */
  motion: 'forward' | 'extend' | '';
}

/** 種子決定的中央圖形的意義（同一個種子一定相同；設定不影響） */
export function rootMeaning(seed: string): RootMeaning {
  const r = subRandom(seed, 'meaning');
  return {
    state: r.pick(['speak', ''] as const),
    work: r.pick(['yes', 'yes', 'no'] as const),
    core: r.pick(['big', 'small', 'small', 'none'] as const),
    motion: r.pick(['forward', 'extend', ''] as const),
  };
}

/* ---------- 一次產生用到的東西 ---------- */

interface Gen {
  cfg: BloomConfig;
  seed: string;
  rng: Random;
  /** 摩斯橋用的另一串亂數 */
  bridgeRng: Random;
  /** 自訂文字的摩斯符號（null＝隨機） */
  tokens: MorseToken[] | null;
  morse: MorseLayout;
}

/** 保留成實線的內圈數（跟著放射線的起點時：第一圈 1、第二圈或第一／第二圈 2） */
function solidCount(cfg: BloomConfig): number {
  if (cfg.solidFollow) {
    if (cfg.startRing === 'ring1') return 1;
    if (cfg.startRing === 'ring2' || cfg.startRing === 'ring12') return 2;
  }
  return cfg.solidInner;
}

/** 三角形：三角心把最內層換成三角形（塗滿改到三角形上）；三角環把三角形內接在第一或第二圈 */
function applyTriangle(s: BloomShape, mode: 'core' | 'ring', cfg: BloomConfig, rng: Random) {
  const rings = s.rings as BloomRing[];
  const k = rings.length;
  const tri: BloomTriangle = { mode, rot: rng.next() * TAU, R: 0, fill: false };
  if (mode === 'core') {
    const g = rings[k - 1];
    g.hidden = true;
    g.segs = null;
    tri.R = g.r;
    tri.fill = s.fill;
    s.fill = false;
  } else {
    const which =
      cfg.triRing === 'random' ? (rng.next() < 0.5 ? 1 : 2) : cfg.triRing === 'second' ? 2 : 1;
    const w = Math.min(which, k);
    const g = rings[k - w];
    g.segs = null;
    g.a0 = 0;
    g.span = TAU;
    tri.R = g.r;
    /* 內接在第二圈時，最內層縮到三角形的內切圓裡面 */
    if (w === 2) rings[k - 1].r = Math.min(rings[k - 1].r, (tri.R / 2) * 0.88);
  }
  s.tri = tri;
}

/** 兩段弧（弧度）的重疊部分（先比對同一圈，再試前後各兩圈） */
function arcOverlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  for (let k = -2; k <= 2; k++) {
    const lo = Math.max(a0, b0 + TAU * k);
    const hi = Math.min(a1, b1 + TAU * k);
    if (hi > lo) return [lo, hi];
  }
  return null;
}

/**
 * 摩斯橋（3.12）：外圈是摩斯環時，每個有長點的字母以「架橋的機率」架一座橋，從那個字母的長點（隨機的順序）
 * 往內接到內圈：內圈是完整的實線圓時接在長點的中間；內圈也是摩斯環時，要和內圈的某個長點重疊，接在重疊的中間。
 * 三角環裡面的層不架。用摩斯橋自己的亂數；排順序用瀏覽器的排序（比較函式回傳隨機值，照原作）。
 */
function buildBridges(s: BloomShape, gen: Gen) {
  s.bridges = [];
  const { cfg, bridgeRng: br } = gen;
  if (!cfg.bridges || !s.rings) return;
  const rings = s.rings;
  for (let i = 0; i < rings.length - 1; i++) {
    const outer = rings[i];
    const inner = rings[i + 1];
    if (!outer.segs?.length || inner.hidden) continue;
    if (s.tri && s.tri.mode === 'ring' && (inner.r < s.tri.R - 1e-6 || outer.r < s.tri.R - 1e-6))
      continue;
    let toMorse: boolean;
    if (inner.segs) toMorse = true;
    else if (isFull(inner)) toMorse = false;
    else continue;
    const byLetter = new Map<number, MorseSeg[]>();
    for (const sg of outer.segs)
      if (sg.dash) {
        const list = byLetter.get(sg.letter);
        if (list) list.push(sg);
        else byLetter.set(sg.letter, [sg]);
      }
    for (const dashes of byLetter.values()) {
      if (br.next() >= cfg.pBridge) continue;
      const shuffled = dashes.slice().sort(() => br.next() - 0.5);
      for (const d of shuffled) {
        if (!toMorse) {
          s.bridges.push({ a: (d.a0 + d.a1) / 2, r0: inner.r, r1: outer.r });
          break;
        }
        let hit: [number, number] | null = null;
        for (const e of inner.segs ?? []) {
          if (!e.dash) continue;
          const ov = arcOverlap(d.a0, d.a1, e.a0, e.a1);
          if (ov) {
            hit = ov;
            break;
          }
        }
        if (hit) {
          s.bridges.push({ a: (hit[0] + hit[1]) / 2, r0: inner.r, r1: outer.r });
          break;
        }
      }
    }
  }
}

/** 一個圖形（3.3）：依序取種類、旋轉、強調色、塗滿，再取種類自己的亂數 */
function makeShape(
  x: number,
  y: number,
  r: number,
  depth: number,
  gen: Gen,
  isRoot: boolean,
): BloomShape {
  const { cfg, rng } = gen;
  let kind: ShapeKind;
  let triangle: TriKind | null = null;
  if (isRoot) kind = cfg.rootRings ? 'rings' : rng.next() < 0.5 ? 'circle' : 'rings';
  else if (cfg.tris.length) {
    if (cfg.noPlainShapes || rng.next() < cfg.pTri) {
      triangle =
        cfg.tris.length === 2 ? (rng.next() < 0.5 ? cfg.tris[0] : cfg.tris[1]) : cfg.tris[0];
      kind = 'rings';
    } else kind = rng.pick(cfg.shapes);
  } else kind = rng.pick(cfg.shapes);
  const rotation = rng.range(0, TAU);
  const accent = rng.next() < cfg.pAccent;
  const fill = rng.next() < cfg.pFill;
  const shape: BloomShape = { x, y, r, depth, kind, rotation, accent, fill };

  if (kind === 'rings' || kind === 'mix') {
    const lo = Math.min(cfg.minRings, cfg.maxRings);
    const hi = Math.max(cfg.minRings, cfg.maxRings, 2);
    const count = rng.int(Math.max(2, lo), hi);
    const radii: number[] = [];
    for (let i = 0; i < count; i++) radii.push(r * (1 - (i / count) * rng.range(0.85, 1)));
    const rings: BloomRing[] = radii.map((rr) => ({ r: rr, a0: 0, span: TAU, segs: null }));
    if (kind === 'mix')
      for (const g of rings)
        if (rng.next() < 0.55) {
          g.a0 = rng.range(0, TAU);
          g.span = rng.pick(ARC_SPANS);
        }
    if (cfg.morse) {
      const solid = solidCount(cfg);
      /* 短點的長度跟著代數縮小（縮小的程度＝morseShrink；原作用 Math.pow） */
      const unit =
        // biome-ignore lint/style/useExponentiationOperator: 照原作的算法
        cfg.morseDot * (1 - cfg.morseShrink + cfg.morseShrink * Math.pow(cfg.shrink, depth));
      rings.forEach((g, i) => {
        const fromInside = count - i;
        if (fromInside > solid && rng.next() < cfg.pMorse) {
          const start = g.span >= TAU - 1e-6 ? rng.range(0, TAU) : g.a0;
          g.segs = layoutMorse(g.r, start, g.span, Math.max(0.5, unit), gen.morse, rng, gen.tokens);
        }
      });
    }
    shape.rings = rings;
  }
  if (triangle) applyTriangle(shape, triangle === 'triCore' ? 'core' : 'ring', cfg, rng);
  if (shape.rings) buildBridges(shape, gen);
  if (kind === 'semi') shape.closed = rng.next() < 0.6;
  if (kind === 'square' || kind === 'doubleSquare') {
    /* 清單的第三項（0～90° 的隨機角度）先取，再從三項裡選 */
    const tilt = rng.range(0, Math.PI / 2);
    shape.rotation = rng.pick([0, Math.PI / 4, tilt]);
  }
  return shape;
}

/**
 * 中央圖形的意義（3.14）：只套在中央的同心圓上（中央是圓時不套）。用中央圖形自己的亂數。
 * 說話中＝三角心；工作＝最內層看得到的那一圈換成實線或摩斯環；伸長中而看得到的層不到 3 層時往內加一層；
 * 中心換成大的實心圓、一般的中心點或沒有，而且不塗滿；最後重新架摩斯橋。
 */
function applyMeaning(root: BloomShape, meaning: RootMeaning, gen: Gen) {
  const rings = root.rings;
  if (!rings) return;
  const sr = subRandom(gen.seed, 'sem');
  const addInner = () =>
    rings.push({ r: rings[rings.length - 1].r * 0.55, a0: 0, span: TAU, segs: null });
  if (meaning.state === 'speak' && !(root.tri && root.tri.mode === 'core')) {
    root.tri = null;
    for (const g of rings) g.hidden = false;
    if (rings.length < 3) addInner();
    applyTriangle(root, 'core', gen.cfg, sr);
  }
  const first = innerRing(root, 1);
  if (meaning.work === 'yes') {
    first.segs = null;
    first.a0 = 0;
    first.span = TAU;
  } else {
    const unit = Math.max(0.5, gen.cfg.morseDot);
    first.segs = layoutMorse(first.r, sr.next() * TAU, TAU, unit, gen.morse, sr, gen.tokens);
    first.span = TAU;
  }
  if (meaning.motion === 'extend' && visibleRings(root).length < 3) addInner();
  root.core = meaning.core;
  root.fill = false;
  if (root.tri) root.tri.fill = false;
  buildBridges(root, gen);
}

/* ---------- 線的起點與終點 ---------- */

/**
 * 從圖形中心往角度 a 到邊緣的距離（「線從圖形的邊緣出發」）：正方形量到正方形的邊；
 * 半圓在弧那一側是外半徑、直徑那一側是 0（貼著放的時候一律外半徑）；其他是外半徑。
 */
function edgeDistance(s: BloomShape, a: number, forAttach = false): number {
  if (s.kind === 'square' || s.kind === 'doubleSquare') {
    const half = s.r / Math.SQRT2;
    const la = a - s.rotation;
    return half / Math.max(Math.abs(Math.cos(la)), Math.abs(Math.sin(la)));
  }
  if (s.kind === 'semi') {
    if (forAttach) return s.r;
    const la = (((a - s.rotation) % TAU) + TAU) % TAU;
    return la <= Math.PI ? s.r : 0;
  }
  return s.r;
}

/**
 * 線在圖形上的半徑（3.11）：中心＝0；同心圓依「放射線的起點」取那一圈（全部隨機＝看得到的層隨機一層）；
 * 其他圖形依「線從圖形的邊緣出發」（angle 沒給時＝外半徑）。
 */
function ringRadius(s: BloomShape, cfg: BloomConfig, rng: Random, angle?: number): number {
  if (cfg.startRing === 'center') return 0;
  if (cfg.startRing === 'any' && s.rings) {
    const list = visibleRings(s);
    return list[Math.floor(rng.next() * list.length)].r;
  }
  if (s.rings && cfg.startRing !== 'edge') {
    const k =
      cfg.startRing === 'ring12' ? (rng.next() < 0.5 ? 1 : 2) : cfg.startRing === 'ring1' ? 1 : 2;
    return s.rings[Math.max(0, s.rings.length - k)].r;
  }
  return cfg.fromEdge ? (angle === undefined ? s.r : edgeDistance(s, angle)) : 0;
}

/** 「全部隨機」的起點：保留成實線的內圈裡、角度 a 上有畫到的層（三角環裡面的不算） */
function solidRingsAt(s: BloomShape, a: number, cfg: BloomConfig): BloomRing[] {
  const rings = s.rings as BloomRing[];
  const k = rings.length;
  const solid = solidCount(cfg);
  const out: BloomRing[] = [];
  rings.forEach((g, i) => {
    if (k - i > solid || g.hidden || g.segs) return;
    if (s.tri && s.tri.mode === 'ring' && g.r < s.tri.R - 1e-6) return;
    if (!isFull(g) && normAngle(a - s.rotation - g.a0) > g.span) return;
    out.push(g);
  });
  return out;
}

/** 線接到子圖形的哪個半徑：三角形接在三角形的外接圓；同心圓（接在同一圈時）照起點的規則；其他照邊緣 */
function endRadius(child: BloomShape, cfg: BloomConfig, rng: Random, angle: number): number {
  if (child.tri) return child.tri.R;
  if (child.rings && cfg.endAtRing) return ringRadius(child, cfg, rng);
  return cfg.fromEdge ? edgeDistance(child, angle + Math.PI) : 0;
}

/** 三角形第 e 條邊的法線方向（邊的中點朝外） */
const triNormal = (tri: BloomTriangle, e: number) => tri.rot + Math.PI / 3 + (e * TAU) / 3;

/* ---------- 產生 ---------- */

export interface GenerateOptions {
  /** 重疊判定、線的交叉用空間格子加速（預設 true；false＝逐一比對，結果相同） */
  index?: boolean;
}

/** 依設定與種子產生整張花紋 */
export function generateBloom(
  cfg: BloomConfig,
  seed: string,
  { index = true }: GenerateOptions = {},
): BloomScene {
  const rng = seedRandom(seed);
  const gen: Gen = {
    cfg,
    seed,
    rng,
    bridgeRng: subRandom(seed, 'bridge'),
    tokens: morseTokens(cfg.morseText),
    morse: {
      dash: cfg.morseDash,
      gap: cfg.morseGap,
      letterGap: cfg.morseLetterGap,
      wordGap: cfg.morseWordGap,
      pDash: cfg.pMorseDash,
      pWord: cfg.pMorseWord,
    },
  };
  const shapes: BloomShape[] = [];
  const lines: BloomLine[] = [];
  const dots: BloomDot[] = [];
  let order = '';
  const near: CircleIndex<BloomShape> = index ? gridIndex() : linearIndex();
  /* 線的格子只有「線不跨過既有的線」用到 */
  const crossing: SegmentIndex<BloomLine> | null = cfg.noCross
    ? index
      ? lineIndex()
      : linearSegments()
    : null;
  const addShape = (s: BloomShape) => {
    shapes.push(s);
    near.add(s);
    order += 's';
  };
  const addLine = (l: BloomLine) => {
    lines.push(l);
    crossing?.add(l);
    order += 'l';
  };

  const rootR = rng.range(cfg.rootMin, cfg.rootMax);
  const root = makeShape(cfg.width / 2, cfg.height / 2, rootR, 0, gen, true);
  const meaning = rootMeaning(seed);
  applyMeaning(root, meaning, gen);
  addShape(root);
  const queue: BloomShape[] = [root];
  const overlapTries = cfg.avoidOverlap && cfg.overlapMode === 'retry' ? RETRY_LIMIT : 0;

  for (let qi = 0; qi < queue.length; qi++) {
    const parent = queue[qi];
    if (shapes.length >= cfg.maxShapes || lines.length >= cfg.maxLines) break;
    if (parent.depth >= cfg.maxDepth) continue;
    if (parent !== root && rng.next() > cfg.pBranch) continue;
    let count = rng.int(cfg.branchMin, cfg.branchMax);
    const base = rng.range(0, TAU);
    /* 中央圖形「前進中／伸長中」：從第一／第二圈長出三條平均分開的線（中央是圓時沒有；原作會停住，D13） */
    const motion =
      parent === root && parent.rings && meaning.motion
        ? meaning.motion === 'forward'
          ? 1
          : 2
        : 0;
    if (motion) count = 3;
    /* 三角形每條邊最多一條線，從邊的中點往外 */
    if (parent.tri) count = Math.min(count, 3);
    const freeEdges = [0, 1, 2];
    const tries = overlapTries || (motion ? MOTION_TRIES : 1);
    // biome-ignore lint/style/useExponentiationOperator: 照原作的算法
    const scale = Math.pow(cfg.shrink, parent.depth);

    for (let i = 0; i < count; i++) {
      if (lines.length >= cfg.maxLines) break;
      const baseAngle = base + (i / count) * Math.PI * 2;
      for (let t = 0; t < tries; t++) {
        const jitter = (1 - cfg.regularity) * Math.PI * (t ? 1 : 0.5);
        let angle: number;
        let edge = -1;
        if (parent.tri) {
          if (!freeEdges.length) break;
          edge =
            freeEdges[
              t === 0 && freeEdges.includes(i % 3)
                ? freeEdges.indexOf(i % 3)
                : Math.floor(rng.next() * freeEdges.length)
            ];
          angle = triNormal(parent.tri, edge);
        } else if (motion)
          angle = base + (i / 3) * TAU + (t ? rng.range(-0.5, 0.5) * Math.min(1, t / 4) : 0);
        else angle = (t ? rng.range(0, TAU) : baseAngle) + rng.range(-jitter, jitter);
        const len = rng.range(cfg.lineMin, cfg.lineMax) * scale;

        let startR: number;
        if (motion) startR = innerRing(parent, motion).r;
        else if (parent.tri) startR = parent.tri.R / 2;
        else if (cfg.startRing === 'any' && parent.rings) {
          const cands = solidRingsAt(parent, angle, cfg);
          /* 這個角度上沒有實線的內圈：這條線不長 */
          if (!cands.length) break;
          startR = cands[Math.floor(rng.next() * cands.length)].r;
        } else startR = ringRadius(parent, cfg, rng, angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const sx = parent.x + cos * startR;
        const sy = parent.y + sin * startR;
        let wantShape =
          shapes.length < cfg.maxShapes &&
          (rng.next() < cfg.pShape || (motion > 0 && cfg.pShape > 0));
        const childR = rng.range(cfg.childMin, cfg.childMax) * scale;

        /* 不畫線、直接貼著父圖形放（3.13） */
        if (cfg.pAttach > 0 && shapes.length < cfg.maxShapes && rng.next() < cfg.pAttach) {
          const d0 = edgeDistance(parent, angle, true) + childR * (1 - cfg.attachDepth);
          const ax = parent.x + cos * d0;
          const ay = parent.y + sin * d0;
          if (
            cfg.inBounds &&
            (ax < childR || ay < childR || ax > cfg.width - childR || ay > cfg.height - childR)
          )
            continue;
          if (cfg.avoidOverlap && near.overlaps(ax, ay, childR, cfg.gap, parent)) continue;
          if (edge >= 0) freeEdges.splice(freeEdges.indexOf(edge), 1);
          const child = makeShape(ax, ay, childR, parent.depth + 1, gen, false);
          const d1 =
            edgeDistance(parent, angle, true) +
            edgeDistance(child, angle + Math.PI, true) * (1 - cfg.attachDepth);
          child.x = parent.x + cos * d1;
          child.y = parent.y + sin * d1;
          child.attached = true;
          addShape(child);
          queue.push(child);
          break;
        }

        const dist = parent.r + len + (wantShape ? childR : 0);
        const ex = parent.x + cos * dist;
        const ey = parent.y + sin * dist;
        const lx = parent.x + cos * (parent.r + len);
        const ly = parent.y + sin * (parent.r + len);

        /* 收在畫布內：放圖形時子圖形整個在裡面；只畫線時末端離邊至少 4 px */
        const margin = wantShape ? childR : 4;
        if (
          cfg.inBounds &&
          (ex < margin || ey < margin || ex > cfg.width - margin || ey > cfg.height - margin)
        )
          continue;
        if (cfg.lineAvoid && near.segmentHits(sx, sy, lx, ly, parent)) continue;
        /* 線不跨過既有的線：量到子圖形的外接圓（只畫線時到末端） */
        if (
          crossing?.crosses(
            sx,
            sy,
            wantShape ? ex - cos * childR : lx,
            wantShape ? ey - sin * childR : ly,
          )
        )
          continue;
        if (wantShape && cfg.avoidOverlap && near.overlaps(ex, ey, childR, cfg.gap, null)) {
          if (cfg.overlapMode === 'retry') continue;
          if (cfg.overlapMode === 'skip') break;
          wantShape = false;
        }
        /* 只畫線時：末端落在父圖形以外的圖形裡也不畫 */
        if (!wantShape && cfg.avoidOverlap && near.overlaps(lx, ly, 2, 0, parent)) {
          if (cfg.overlapMode === 'retry') continue;
          break;
        }

        const accent = rng.next() < cfg.pAccent;
        if (edge >= 0) freeEdges.splice(freeEdges.indexOf(edge), 1);
        if (wantShape) {
          const child = makeShape(ex, ey, childR, parent.depth + 1, gen, false);
          const er = endRadius(child, cfg, rng, angle);
          addLine({ x1: sx, y1: sy, x2: ex - cos * er, y2: ey - sin * er, accent, child: true });
          addShape(child);
          queue.push(child);
        } else {
          addLine({ x1: sx, y1: sy, x2: lx, y2: ly, accent });
          if (rng.next() < cfg.pDot) {
            dots.push({ x: lx, y: ly, r: Math.max(2, cfg.lineWidth * rng.range(1.5, 3)), accent });
            order += 'd';
          }
        }
        break;
      }
    }
  }

  /* 線的丟失（3.13）：依畫的順序，連到子圖形的線各自以丟失率決定（自己的一串亂數） */
  if (cfg.pDrop > 0) {
    const dr = subRandom(seed, 'drop');
    for (const l of lines) if (l.child && dr.next() < cfg.pDrop) l.dropped = true;
  }
  return { shapes, lines, dots, order };
}
