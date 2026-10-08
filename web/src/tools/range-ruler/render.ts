/**
 * 量尺的畫法（規格 range-ruler 第 3 節），順序與數值照舊版：
 * 每一格依序 ① 填格子顏色（不透明度 × 整體不透明度 > 0 才填）② 畫 1 px 的半透明黑色框
 * ③ 寫文字（粗體 Arial、置中；描邊寬＝max(2, 字級 × 0.18)、圓角接合，先描邊再填色）。
 * 編輯中的那一格的醒目框不畫進畫布（預覽另外疊一層），所以預覽畫布就是匯出的圖。
 */
import { canvasRgba, colorAlpha } from '@/core/grid';
import type { RulerLayout } from './layout';
import { type CommonSettings, cellLook, drawable } from './settings';

type Ctx = CanvasRenderingContext2D;

/** 方格與六角格的框線顏色（舊版：方格 20%、六角格 22% 的黑） */
export const BORDER = { square: 'rgba(0,0,0,0.2)', hex: 'rgba(0,0,0,0.22)' } as const;

export function drawRuler(
  ctx: Ctx,
  layout: RulerLayout,
  raw: CommonSettings,
  shape: 'square' | 'hex',
): void {
  const s = drawable(raw);
  const cellMul = s.cellOpacity / 100;
  const textMul = s.textOpacity / 100;
  ctx.clearRect(0, 0, layout.width, layout.height);
  for (const cell of layout.cells) {
    const look = cellLook(s, cell.key, cell.d);
    const p = cell.polygon;
    if (shape === 'square') {
      const { x, y } = p[0];
      const cs = p[1].x - x;
      if (colorAlpha(look.color) * cellMul > 0) {
        ctx.fillStyle = canvasRgba(look.color, cellMul);
        ctx.fillRect(x, y, cs, cs);
      }
      ctx.strokeStyle = BORDER.square;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cs, cs);
    } else {
      if (colorAlpha(look.color) * cellMul > 0) {
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
        ctx.closePath();
        ctx.fillStyle = canvasRgba(look.color, cellMul);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.closePath();
      ctx.strokeStyle = BORDER.hex;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.font = `bold ${look.fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { x: tx, y: ty } = cell.center;
    if (s.stroke) {
      ctx.save();
      ctx.strokeStyle = canvasRgba(s.strokeColor, textMul);
      ctx.lineWidth = Math.max(2, look.fontSize * 0.18);
      ctx.lineJoin = 'round';
      ctx.strokeText(look.text, tx, ty);
      ctx.restore();
    }
    ctx.fillStyle = canvasRgba(look.textColor, textMul);
    ctx.fillText(look.text, tx, ty);
  }
}
