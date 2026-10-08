/**
 * 網格產生器的畫法（規格 grid-maker 第 3 節）。畫法、順序、座標取整都照舊版，
 * 同樣的設定在同一個瀏覽器裡會畫出逐像素相同的 PNG：
 * - 方格：縮小 100% 且圓角 0 時畫整條線（先直線再橫線，每條各自 stroke）；否則逐格（欄優先）畫圓角矩形。
 * - 六角格：縮小 100% 時每格只畫 3 條邊（右上 → 左上 → 左 → 左下），負責另外 3 條邊的鄰格不在範圍內時自己補；
 *   縮小時每格畫完整的 6 條邊。座標文字在每一格畫完邊之後立刻畫（後面的格子的線會蓋在前面的字上）。
 * - 線條都落在格子邊界上，不加半像素位移。
 */
import {
  canvasRgba,
  gridLineDash,
  hexCoordLabel,
  hexCorners,
  hexSheet,
  hexSheetCells,
  hexSheetCenter,
  hexSheetFlatCenter,
  hexSheetMissingEdges,
  type Point,
  squareCellRect,
  squareCoordLabel,
  squareSheetLines,
  squareSheetSize,
} from '@/core/grid';
import { drawableHex, drawableSquare, type HexSettings, type SquareSettings } from './settings';

type Ctx = CanvasRenderingContext2D;

/** 線條的共同設定：顏色、線寬、線型；發光時陰影模糊＝線寬 × 7、顏色不透明 */
function applyLineStyle(
  ctx: Ctx,
  color: string,
  width: number,
  style: SquareSettings['lineStyle'],
) {
  ctx.strokeStyle = canvasRgba(color);
  ctx.lineWidth = width;
  ctx.setLineDash(gridLineDash(style, width));
}

function applyGlow(ctx: Ctx, on: boolean, color: string, width: number) {
  if (on) {
    ctx.shadowColor = canvasRgba(color, 1, 1);
    ctx.shadowBlur = width * 7;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}

function setLabelFont(ctx: Ctx, color: string, px: number) {
  ctx.fillStyle = canvasRgba(color);
  ctx.font = `${px}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

/**
 * 方格。呼叫前畫布要已經是 squareSheetSize 的大小（設定 width／height 會一併清空與重設狀態）。
 */
export function drawSquareGrid(ctx: Ctx, raw: SquareSettings): void {
  const s = drawableSquare(raw);
  const { width, height } = squareSheetSize(s.cols, s.rows, s.size);
  ctx.clearRect(0, 0, width, height);
  applyLineStyle(ctx, s.lineColor, s.lineWidth, s.lineStyle);
  applyGlow(ctx, s.glow, s.lineColor, s.lineWidth);

  const scale = s.scale / 100;
  if (scale >= 0.999 && s.cornerRadius === 0) {
    for (const seg of squareSheetLines(s.cols, s.rows, s.size)) {
      ctx.beginPath();
      ctx.moveTo(seg.from.x, seg.from.y);
      ctx.lineTo(seg.to.x, seg.to.y);
      ctx.stroke();
    }
  } else {
    const side = s.size * scale;
    const radius = Math.min(s.cornerRadius, side / 2, side / 2);
    for (let c = 0; c < s.cols; c++) {
      for (let r = 0; r < s.rows; r++) {
        const rect = squareCellRect(c, r, s.size, scale);
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
        ctx.stroke();
      }
    }
  }

  if (!s.showCoords) return;
  /* 文字不發光、不用虛線 */
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.setLineDash([]);
  setLabelFont(ctx, s.coordColor, s.coordFontSize);
  const half = (s.size * scale) / 2;
  const coord = {
    cols: s.cols,
    rows: s.rows,
    origin: s.coordOrigin,
    format: s.coordFormat,
    start: s.coordStart,
  };
  for (let c = 0; c < s.cols; c++) {
    for (let r = 0; r < s.rows; r++) {
      const x = c * s.size + s.size / 2;
      const cy = r * s.size + s.size / 2;
      const y =
        s.coordPos === 'top'
          ? cy - half + s.coordOffset
          : s.coordPos === 'bottom'
            ? cy + half - s.coordOffset
            : cy;
      ctx.fillText(squareCoordLabel(c, r, coord), x, y);
    }
  }
}

/** 舊版畫六角格時角的順序（從左上角往左邊繞）：hexCorners 的 0、5、4、3、2、1 */
const LEGACY = [0, 5, 4, 3, 2, 1] as const;

function segment(ctx: Ctx, a: Point, b: Point) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * 六角格。呼叫前畫布要已經是 hexSheet 的大小。
 */
export function drawHexGrid(ctx: Ctx, raw: HexSettings): void {
  const s = drawableHex(raw);
  const sheet = hexSheet(s);
  const m = sheet.metrics;
  const pointy = s.orientation === 'pointy';
  ctx.clearRect(0, 0, sheet.width, sheet.height);
  applyLineStyle(ctx, s.lineColor, s.lineWidth, s.lineStyle);
  applyGlow(ctx, s.glow, s.lineColor, s.lineWidth);

  const scale = s.scale / 100;
  const threeEdges = scale >= 0.999;
  const coord = {
    cols: sheet.cols,
    rows: sheet.rows,
    origin: s.coordOrigin,
    rowMode: s.rowMode,
    format: s.coordFormat,
    start: s.coordStart,
    serialRows: s.rows,
  };
  /* 上／下時文字離中心的距離：平頂是半高，尖頂是上方兩個角的高度（step ÷ 3），都乘上縮小比例 */
  const halfY = pointy ? (m.step / 3) * scale : (s.size / 2) * scale;

  for (const cell of hexSheetCells(sheet, s.outer)) {
    const all = hexCorners(hexSheetCenter(sheet, cell.col, cell.row), m, scale);
    const v = LEGACY.map((i) => all[i]);
    if (!threeEdges) {
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < 6; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(v[5].x, v[5].y);
      ctx.lineTo(v[0].x, v[0].y);
      ctx.lineTo(v[1].x, v[1].y);
      ctx.lineTo(v[2].x, v[2].y);
      ctx.stroke();
      const miss = hexSheetMissingEdges(sheet, s.outer, cell.col, cell.row);
      if (miss.bottom) segment(ctx, v[2], v[3]);
      if (miss.lowerRight) segment(ctx, v[3], v[4]);
      if (miss.upperRight) segment(ctx, v[4], v[5]);
    }

    if (!s.showCoords || !cell.inside) continue;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    setLabelFont(ctx, s.coordColor, s.coordFontSize);
    const f = hexSheetFlatCenter(sheet, cell.col, cell.row);
    const x = pointy ? f.y : f.x;
    let y = pointy ? f.x : f.y;
    if (s.coordPos === 'top') y = y - halfY + s.coordOffset;
    else if (s.coordPos === 'bottom') y = y + halfY - s.coordOffset;
    ctx.fillText(hexCoordLabel(cell.col, cell.row, coord), x, y);
    /* 畫下一格的線之前恢復線型與發光 */
    ctx.setLineDash(gridLineDash(s.lineStyle, s.lineWidth));
    if (s.glow) {
      ctx.shadowColor = canvasRgba(s.lineColor, 1, 1);
      ctx.shadowBlur = s.lineWidth * 7;
    }
  }
}
