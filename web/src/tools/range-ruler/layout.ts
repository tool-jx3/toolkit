/**
 * 量尺的排法（規格 range-ruler 第 3 節）：畫布尺寸、每一格的位置與距離、點擊判定、檔名。
 * 純函式；數值與運算順序照舊版（同樣的設定會得到同樣的浮點數）。
 */
import {
  colParity,
  hexCornersFromAnchor,
  hexDistance,
  hexMetrics,
  nearestPoint,
  orientPoint,
  type Point,
  squareDistance,
} from '@/core/grid';
import { drawable, type HexSettings, type SquareSettings } from './settings';

export interface RulerCell {
  /** 自訂格的鍵（相對於中心格） */
  key: string;
  /** 相對於中心格的位置：方格 (x, y)、六角格 (c, r)（odd-q） */
  x: number;
  y: number;
  /** 距離 */
  d: number;
  /** 格子的多邊形（畫面座標；方格是左上、右上、右下、左下，六角格依舊版的順序） */
  polygon: Point[];
  /** 文字的位置（格子中心） */
  center: Point;
}

export interface RulerLayout {
  /** 畫布尺寸（整數 px） */
  width: number;
  height: number;
  cells: RulerCell[];
}

/* ---------- 方格 ---------- */

/** 方格量尺：(2 × 範圍 ＋ 1) 格見方，中心格在正中央；由上而下、由左而右 */
export function squareRulerLayout(raw: SquareSettings): RulerLayout {
  const s = drawable(raw);
  const cs = s.size;
  const n = s.range * 2 + 1;
  const cells: RulerCell[] = [];
  for (let cy = -s.range; cy <= s.range; cy++) {
    for (let cx = -s.range; cx <= s.range; cx++) {
      const d = squareDistance(cx, cy, s.method);
      if (d > s.range) continue;
      const px = (cx + s.range) * cs;
      const py = (cy + s.range) * cs;
      cells.push({
        key: `${cx},${cy}`,
        x: cx,
        y: cy,
        d,
        polygon: [
          { x: px, y: py },
          { x: px + cs, y: py },
          { x: px + cs, y: py + cs },
          { x: px, y: py + cs },
        ],
        center: { x: px + cs / 2, y: py + cs / 2 },
      });
    }
  }
  return { width: n * cs, height: n * cs, cells };
}

/** 方格量尺上點到哪一格（畫布座標）；點在格子外時 null */
export function squareRulerHit(raw: SquareSettings, x: number, y: number): RulerCell | null {
  const s = drawable(raw);
  const col = Math.floor(x / s.size);
  const row = Math.floor(y / s.size);
  if (col < 0 || row < 0 || col > s.range * 2 || row > s.range * 2) return null;
  const key = `${col - s.range},${row - s.range}`;
  return squareRulerLayout(raw).cells.find((c) => c.key === key) ?? null;
}

/** 方格量尺的檔名：grid_ruler_<每邊格數>x<每邊格數>.png */
export function squareRulerFileName(raw: SquareSettings): string {
  const n = drawable(raw).range * 2 + 1;
  return `grid_ruler_${n}x${n}.png`;
}

/* ---------- 六角格 ---------- */

/** 舊版畫六角格時角的順序（從左上角往左邊繞）：hexCornersFromAnchor 的 0、5、4、3、2、1 */
const LEGACY = [0, 5, 4, 3, 2, 1] as const;

function hexFrame(raw: HexSettings) {
  const s = drawable(raw);
  const m = hexMetrics(s.size, { orientation: s.orientation, fit: s.fit });
  const csx = m.step;
  const cs = s.size;
  const distY = s.range;
  /* 「直線」時橫向多放幾欄（欄距比列距短） */
  const distX = s.method === 'straight' ? Math.round((s.range * 2) / Math.sqrt(3)) : s.range;
  const w = s.fit ? (distX * 2 + 2) * csx : (distX * 2 + 1 + 1 / 3) * csx;
  const h = (distY * 2 + 1) * cs;
  const pointy = s.orientation === 'pointy';
  /* 畫布寬高設成小數時，瀏覽器取整數部分 */
  return {
    s,
    m,
    csx,
    cs,
    distX,
    distY,
    width: Math.trunc(pointy ? h : w),
    height: Math.trunc(pointy ? w : h),
  };
}

/**
 * 六角格量尺：中心格四周依 odd-q（奇數欄往下錯開半格）排列；由上而下、由左而右。
 * 網格化時欄距＝格子大小、左邊多留半欄；「直線」時橫向的欄數＝round(範圍 × 2 ÷ √3)。
 */
export function hexRulerLayout(raw: HexSettings): RulerLayout {
  const f = hexFrame(raw);
  const { s, m, csx, cs, distX, distY } = f;
  const cells: RulerCell[] = [];
  for (let r = -distY; r <= distY; r++) {
    for (let c = -distX; c <= distX; c++) {
      const d = hexDistance(c, r, s.method);
      if (d > s.range) continue;
      const odd = colParity(c);
      const hx = s.fit ? (c + distX + 1 / 6 + 0.5) * csx : (c + distX + 1 / 3) * csx;
      const hy = (r + distY + odd / 2) * cs;
      const corners = hexCornersFromAnchor({ x: hx, y: hy }, m);
      cells.push({
        key: `${c},${r}`,
        x: c,
        y: r,
        d,
        polygon: LEGACY.map((i) => corners[i]),
        center: orientPoint({ x: hx + csx / 3, y: hy + cs / 2 }, s.orientation),
      });
    }
  }
  return { width: f.width, height: f.height, cells };
}

/** 六角格量尺上點到哪一格：最近的格子中心，距離超過格子大小 × 0.65 時當作點在格子外 */
export function hexRulerHit(raw: HexSettings, x: number, y: number): RulerCell | null {
  const s = drawable(raw);
  return (
    nearestPoint(
      hexRulerLayout(raw).cells.map((c) => ({ ...c.center, cell: c })),
      x,
      y,
      s.size * 0.65,
    )?.cell ?? null
  );
}

/** 六角格量尺的檔名：使用網格時 hex_ruler_<寬 ÷ 大小 × 2>x<高 ÷ 大小 × 2>.png（四捨五入），否則 hex_ruler.png */
export function hexRulerFileName(raw: HexSettings): string {
  const f = hexFrame(raw);
  if (!f.s.fit) return 'hex_ruler.png';
  return `hex_ruler_${Math.round((f.width / f.cs) * 2)}x${Math.round((f.height / f.cs) * 2)}.png`;
}
