/**
 * 產生花紋（規格 3.2、3.3）：從中央圓開始，依加入的順序（廣度優先）一個一個圖形往外長線，線的末端放子圖形或加點。
 * 亂數的取用順序與浮點數的算法都照原作（al1scut/tkmizGeo）：差一點點就會讓某個比較翻轉，後面整張圖都不同。
 * 純計算，不依賴 DOM（Worker 與主執行緒共用）。
 */
import type { Random } from '@/core/timeline/random';
import { seedRandom } from './random';
import type { BloomConfig, ShapeKind } from './settings';
import { type CircleIndex, gridIndex, linearIndex } from './spatial';

/** 圓＋半圓的一層弧（從 start 開始、長度 span，弧度） */
export interface BloomArc {
  start: number;
  span: number;
}

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
  /** 同心圓、圓＋半圓：每一層的半徑（由外而內） */
  rings?: number[];
  /** 圓＋半圓：每一層是弧（BloomArc）或完整的圓（null） */
  arcs?: (BloomArc | null)[];
  /** 半圓：有直徑（閉合） */
  closed?: boolean;
}

export interface BloomLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  accent: boolean;
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
}

export interface BloomStats {
  shapes: number;
  lines: number;
  dots: number;
}

export const sceneStats = (s: BloomScene): BloomStats => ({
  shapes: s.shapes.length,
  lines: s.lines.length,
  dots: s.dots.length,
});

const TAU = Math.PI * 2;
/** 圓＋半圓的弧長：180°（兩份）、90°、270° */
const ARC_SPANS = [Math.PI, Math.PI, Math.PI / 2, Math.PI * 1.5] as const;
/** 「換角度重試」時每條線最多試幾次 */
export const RETRY_LIMIT = 14;

/** 一個圖形（3.3）：依序取種類、旋轉、強調色、塗滿，再取種類自己的亂數 */
function makeShape(
  x: number,
  y: number,
  r: number,
  depth: number,
  cfg: BloomConfig,
  rng: Random,
  isRoot: boolean,
): BloomShape {
  const kind: ShapeKind = isRoot ? (rng.next() < 0.5 ? 'circle' : 'rings') : rng.pick(cfg.shapes);
  const rotation = rng.range(0, TAU);
  const accent = rng.next() < cfg.pAccent;
  const fill = rng.next() < cfg.pFill;
  const shape: BloomShape = { x, y, r, depth, kind, rotation, accent, fill };
  if (kind === 'rings' || kind === 'mix') {
    const count = rng.int(2, Math.max(2, cfg.maxRings));
    const rings: number[] = [];
    for (let i = 0; i < count; i++) rings.push(r * (1 - (i / count) * rng.range(0.85, 1)));
    shape.rings = rings;
    if (kind === 'mix')
      shape.arcs = rings.map(() =>
        rng.next() < 0.55 ? { start: rng.range(0, TAU), span: rng.pick(ARC_SPANS) } : null,
      );
  }
  if (kind === 'semi') shape.closed = rng.next() < 0.6;
  if (kind === 'square' || kind === 'doubleSquare') {
    /* 清單的第三項（0～90° 的隨機角度）先取，再從三項裡選 */
    const tilt = rng.range(0, Math.PI / 2);
    shape.rotation = rng.pick([0, Math.PI / 4, tilt]);
  }
  return shape;
}

export interface GenerateOptions {
  /** 重疊判定用空間格子加速（預設 true；false＝逐一比對，結果相同） */
  index?: boolean;
}

/** 依設定與種子產生整張花紋 */
export function generateBloom(
  cfg: BloomConfig,
  seed: string,
  { index = true }: GenerateOptions = {},
): BloomScene {
  const rng = seedRandom(seed);
  const shapes: BloomShape[] = [];
  const lines: BloomLine[] = [];
  const dots: BloomDot[] = [];
  const near: CircleIndex<BloomShape> = index ? gridIndex() : linearIndex();
  const addShape = (s: BloomShape) => {
    shapes.push(s);
    near.add(s);
  };

  const rootR = rng.range(cfg.rootMin, cfg.rootMax);
  const root = makeShape(cfg.width / 2, cfg.height / 2, rootR, 0, cfg, rng, true);
  addShape(root);
  const queue: BloomShape[] = [root];
  const tries = cfg.avoidOverlap && cfg.overlapMode === 'retry' ? RETRY_LIMIT : 1;

  for (
    let qi = 0;
    qi < queue.length && shapes.length < cfg.maxShapes && lines.length < cfg.maxLines;
    qi++
  ) {
    const parent = queue[qi];
    if (parent.depth >= cfg.maxDepth) continue;
    if (parent !== root && rng.next() > cfg.pBranch) continue;
    const count = rng.int(cfg.branchMin, cfg.branchMax);
    const base = rng.range(0, TAU);
    /* 縮小倍率只看父圖形的代數（原作用 Math.pow，結果和 ** 相同但照寫） */
    // biome-ignore lint/style/useExponentiationOperator: 照原作的算法
    const scale = Math.pow(cfg.shrink, parent.depth);
    const startOffset = cfg.fromEdge ? parent.r : 0;

    for (let i = 0; i < count; i++) {
      if (lines.length >= cfg.maxLines) break;
      const baseAngle = base + (i / count) * Math.PI * 2;
      let placed = false;
      for (let t = 0; t < tries && !placed; t++) {
        const jitter = (1 - cfg.regularity) * Math.PI * (t ? 1 : 0.5);
        const angle = (t ? rng.range(0, TAU) : baseAngle) + rng.range(-jitter, jitter);
        const len = rng.range(cfg.lineMin, cfg.lineMax) * scale;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const sx = parent.x + cos * startOffset;
        const sy = parent.y + sin * startOffset;
        let wantShape = shapes.length < cfg.maxShapes && rng.next() < cfg.pShape;
        const childR = rng.range(cfg.childMin, cfg.childMax) * scale;
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
        if (wantShape) {
          const child = makeShape(ex, ey, childR, parent.depth + 1, cfg, rng, false);
          const endOffset = cfg.fromEdge ? childR : 0;
          lines.push({
            x1: sx,
            y1: sy,
            x2: ex - cos * endOffset,
            y2: ey - sin * endOffset,
            accent,
          });
          addShape(child);
          queue.push(child);
        } else {
          lines.push({ x1: sx, y1: sy, x2: lx, y2: ly, accent });
          if (rng.next() < cfg.pDot)
            dots.push({ x: lx, y: ly, r: Math.max(2, cfg.lineWidth * rng.range(1.5, 3)), accent });
        }
        placed = true;
      }
    }
  }
  return { shapes, lines, dots };
}
