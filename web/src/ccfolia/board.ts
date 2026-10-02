/**
 * CCFOLIA 盤面的座標與格數（外部格式事實，room-zip 規格 3.1.5、3.2.1；psd-studio 規格 2.3；foreground-frame 規格 3.13）。
 *
 * - 1 格＝24 px（盤面、前景的寬高都以格設定）。
 * - 原點在盤面中央，往右、往下為正；マーカーパネル、スクリーンパネル的 x、y 是**左上角**（40×30 的盤面，左上角是 (−20, −15)）。
 * - 取整一律「四捨五入，剛好 .5 時往絕對值大的方向」（2.5 → 3、−2.5 → −3）。
 */

/** CCFOLIA 的 1 格（px） */
export const GRID_PX = 24;

/** 四捨五入到整數格，剛好 .5 往絕對值大的方向；不是有限數字時是 0 */
export function roundGrid(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? Math.ceil(v - 0.5) : Math.floor(v + 0.5);
}

/** 寬高：取整（同 roundGrid）且至少 1；不是有限數字時用 fallback（再取整） */
export function gridLength(v: number, fallback = 4): number {
  return Math.max(1, roundGrid(Number.isFinite(v) ? v : fallback));
}

export const pxToCells = (px: number): number => px / GRID_PX;
export const cellsToPx = (cells: number): number => cells * GRID_PX;

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 「中心座標＋寬高」→ CCFOLIA 的「左上角＋寬高」（room-zip 3.2.1）：
 * 寬高＝gridLength，x＝roundGrid(roundGrid(中心 x) − 寬 / 2)，y 同理。
 * 例：中心 0、寬 9 → −4.5 → −5；中心 −5、寬 9 → −9.5 → −10。
 */
export function centerToTopLeft(rect: GridRect): GridRect {
  const width = gridLength(rect.width);
  const height = gridLength(rect.height);
  return {
    x: roundGrid(roundGrid(rect.x) - width / 2),
    y: roundGrid(roundGrid(rect.y) - height / 2),
    width,
    height,
  };
}

/** 「左上角＋寬高」→ 中心座標（不取整） */
export function topLeftToCenter(rect: GridRect): GridRect {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

/** 盤面（寬 W、高 H 格）左上角的座標：(−W/2, −H/2) */
export function boardTopLeft(fieldWidth: number, fieldHeight: number): { x: number; y: number } {
  return { x: -fieldWidth / 2, y: -fieldHeight / 2 };
}

/** 盤面上（左上角座標，格）→ 圖片上的 px（盤面左上角是 (0,0)；cellPx 預設 24） */
export function boardToPx(
  x: number,
  y: number,
  fieldWidth: number,
  fieldHeight: number,
  cellPx = GRID_PX,
): { x: number; y: number } {
  return { x: (x + fieldWidth / 2) * cellPx, y: (y + fieldHeight / 2) * cellPx };
}

/* ---------- 前景的建議格數（foreground-frame 3.13） ---------- */

/** 建議格數的上限（每邊） */
export const GRID_SUGGEST_MAX = 64;
/** 建議格數的基準長邊 */
export const GRID_SUGGEST_BASE = 48;

export interface GridSuggestion {
  /** 寬（格） */
  width: number;
  /** 高（格） */
  height: number;
  /** 比例無法剛好，這是接近值（介面要註明） */
  approximate: boolean;
}

const gcd = (a: number, b: number): number => {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return x;
};

/** 依原作的三條規則（以寬為長邊）；直式圖片由呼叫端對調 */
function suggestLandscape(w: number, h: number): GridSuggestion {
  if (w % GRID_PX === 0 && h % GRID_PX === 0 && w / GRID_PX <= GRID_SUGGEST_MAX) {
    return { width: w / GRID_PX, height: h / GRID_PX, approximate: false };
  }
  const g = gcd(w, h);
  const a = w / g;
  const b = h / g;
  if (a <= GRID_SUGGEST_MAX && b <= GRID_SUGGEST_MAX) {
    const m = Math.max(1, Math.round(GRID_SUGGEST_BASE / a));
    return { width: a * m, height: b * m, approximate: false };
  }
  return {
    width: GRID_SUGGEST_BASE,
    height: Math.max(1, Math.round((GRID_SUGGEST_BASE * h) / w)),
    approximate: true,
  };
}

/**
 * 前景圖（寬 × 高 px）在 CCFOLIA 該設定的格數（foreground-frame 3.13）：
 * 1. 寬、高都是 24 的倍數且寬 ÷ 24 ≤ 64 → 寬 ÷ 24、高 ÷ 24；
 * 2. 否則約成最簡整數比 a : b，a、b 都 ≤ 64 → 乘上 m＝max(1, round(48 ÷ a))；
 * 3. 否則寬 48、高＝round(48 × 高 ÷ 寬)，標為接近值。
 * 例：1920×1080 → 48×27；1440×1080 → 60×45；1001×700 → 48×34（接近值）。
 *
 * 極端比例的修正（foreground-frame 第 7 節裁定）：原作只看寬，直式圖片可能得到超過 64 格的結果（64×4096 → 48×3072）；
 * 結果任一邊超過 64 時改以高為長邊套用同樣的規則（64×4096 → 1×64）。橫式與正方形的結果與原作相同。
 * 輸入先取整數 px（至少 1）。
 */
export function suggestGridCells(widthPx: number, heightPx: number): GridSuggestion {
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));
  const first = suggestLandscape(w, h);
  if (first.width <= GRID_SUGGEST_MAX && first.height <= GRID_SUGGEST_MAX) return first;
  const t = suggestLandscape(h, w);
  return { width: t.height, height: t.width, approximate: t.approximate };
}

/**
 * 把畫布上的一個範圍換算成格（foreground-frame F11 的「窗的資訊」）：
 * 格數＝長度 ÷ 畫布長度 × 盤面格數；位置同理（相對畫布左上角）。不取整，顯示時由工具決定位數（F11 取一位小數）。
 * 例：畫布 1920×1080（48×27 格）、範圍 (36,36) 1848×1008 → 位置 0.9, 0.9，大小 46.2 × 25.2。
 */
export function rectToGridCells(
  rect: GridRect,
  canvas: { width: number; height: number },
  grid: { width: number; height: number },
): GridRect {
  const sx = grid.width / canvas.width;
  const sy = grid.height / canvas.height;
  return { x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy };
}
