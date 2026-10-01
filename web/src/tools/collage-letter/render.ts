/**
 * 拼貼信的畫布繪製（瀏覽器端）：量字寬、畫紙片、輸出 PNG／JPG（紙張底）。
 */
import { ensureFonts, fontCss } from '@/core/fonts';
import { canvasToBlob, canvasToJpeg, makeCanvas } from '@/core/image';
import {
  type CollageLayout,
  type MeasureFn,
  PAPER_COLOR,
  PIECE_SHADOW,
  type PieceFont,
  pieceCorners,
  SPECK_COLOR,
  SPECK_SIZE,
  speckCount,
} from './collage';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 畫布用的字型字串（一般字重＝字型本身的字重；系統字型用通用字族） */
export function pieceFontCss(font: PieceFont, size: number): string {
  return font.generic ? `${font.weight} ${size}px sans-serif` : fontCss(font, size);
}

/** 用畫布量字寬 */
export function createMeasure(): MeasureFn {
  const ctx = makeCanvas(1, 1).getContext('2d') as Ctx;
  return (ch, font, size) => {
    ctx.font = pieceFontCss(font, size);
    return ctx.measureText(ch).width;
  };
}

/** 產生前先載入要用到的字型（只下載這段文字需要的部分；逾時就用替代字型） */
export async function prepareFonts(fonts: readonly PieceFont[], text: string): Promise<void> {
  const chars = Array.from(new Set(Array.from(text.replace(/\s/g, '')))).join('') || undefined;
  await ensureFonts(
    fonts
      .filter((f) => !f.generic)
      .map((f) => ({ family: f.family, weight: f.weight, text: chars })),
  );
}

/** 把排版畫到畫布上（透明背景）。畫布尺寸要先設成 layout.canvasWidth × canvasHeight。 */
export function drawCollage(ctx: Ctx, layout: CollageLayout): void {
  ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  for (const line of layout.lines) {
    for (const p of line.items) {
      if (p.kind !== 'piece') continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotate * Math.PI) / 180);
      /* 紙片：實色填滿的四邊形＋投影（投影的位移不受旋轉影響，一律往右下） */
      const corners = pieceCorners(p);
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.shadowColor = PIECE_SHADOW.color;
      ctx.shadowOffsetX = PIECE_SHADOW.x;
      ctx.shadowOffsetY = PIECE_SHADOW.y;
      ctx.shadowBlur = PIECE_SHADOW.blur;
      ctx.fillStyle = p.bg;
      ctx.fill();
      /* 字：沒有投影，置中 */
      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
      ctx.font = pieceFontCss(p.font, p.size);
      ctx.fillStyle = p.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.ch, 0, 0);
      ctx.restore();
    }
  }
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas, 'image/png');
}

/** 紙張底的 JPG：淺米黃底＋細小的淡黑斑點（每次重新隨機），再疊上目前的拼貼 */
export function jpgBlob(
  canvas: HTMLCanvasElement,
  random: () => number = Math.random,
): Promise<Blob> {
  const w = canvas.width;
  const h = canvas.height;
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d') as Ctx;
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SPECK_COLOR;
  const n = speckCount(w, h);
  const span = SPECK_SIZE.max - SPECK_SIZE.min + 1;
  for (let i = 0; i < n; i++) {
    const s = SPECK_SIZE.min + Math.floor(random() * span);
    ctx.fillRect(Math.floor(random() * w), Math.floor(random() * h), s, s);
  }
  ctx.drawImage(canvas, 0, 0);
  return canvasToJpeg(out, { background: null, quality: 0.95 });
}
