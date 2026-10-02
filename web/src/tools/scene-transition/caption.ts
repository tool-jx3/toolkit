/**
 * 字幕圖層（規格 3.7）：水平置中、不自動換行；多行的行距＝字級 × 1.45，整塊以「位置」為中心
 * （正中央＝畫面高 50%、下方 82%、上方 18%）。外框（選填）的顏色依文字亮度自動選黑或白，
 * 寬約字級的 7%（線寬 14%、至少 2 px）、轉角圓滑，畫在文字底下。
 */
import { captionFontCss } from './fonts';
import { type CaptionLayer, captionLayerFrom } from './render';
import type { Settings, TextPos } from './settings';

export interface CaptionSpec {
  text: string;
  width: number;
  height: number;
  /** 這個解析度下的字級（px） */
  fontSize: number;
  font: string;
  fontName: string;
  color: string;
  pos: TextPos;
  outline: boolean;
}

export const TEXT_MIDDLE: Record<TextPos, number> = { center: 0.5, bottom: 0.82, top: 0.18 };
export const LINE_HEIGHT = 1.45;

/**
 * 設定 → 字幕的規格；字幕去掉頭尾空白後是空的就沒有字幕（null）。
 * scale：預覽時字級的縮放比例（480 ÷ 輸出寬，四捨五入、至少 8 px）。
 */
export function captionSpecOf(
  s: Settings,
  width: number,
  height: number,
  scale = 1,
): CaptionSpec | null {
  const text = s.caption.trim();
  if (!text) return null;
  return {
    text,
    width,
    height,
    fontSize: scale === 1 ? s.fontSize : Math.max(8, Math.round(s.fontSize * scale)),
    font: s.font,
    fontName: s.fontName,
    color: s.textColor,
    pos: s.textPos,
    outline: s.outline,
  };
}

/** 外框顏色：文字的加權亮度（ITU-R BT.601）大於 140 用黑框，否則白框 */
export function outlineColor(hex: string): '#000000' | '#ffffff' {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? '#000000' : '#ffffff';
}

/** 每一行的垂直中心（文字列的中線） */
export function lineCenters(
  spec: Pick<CaptionSpec, 'text' | 'height' | 'fontSize' | 'pos'>,
): number[] {
  const lines = spec.text.split('\n');
  const lh = spec.fontSize * LINE_HEIGHT;
  const middle = spec.height * TEXT_MIDDLE[spec.pos];
  const top = middle - ((lines.length - 1) * lh) / 2;
  return lines.map((_, i) => top + i * lh);
}

/** 畫出字幕圖層（瀏覽器；字型要先載入） */
export function drawCaption(spec: CaptionSpec): CaptionLayer {
  const { width: w, height: h } = spec;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('無法建立畫布');
  ctx.font = captionFontCss(spec.font, spec.fontName, spec.fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = spec.text.split('\n');
  const ys = lineCenters(spec);
  if (spec.outline) {
    ctx.strokeStyle = outlineColor(spec.color);
    ctx.lineWidth = Math.max(2, spec.fontSize * 0.14);
    ctx.lineJoin = 'round';
    lines.forEach((line, i) => {
      ctx.strokeText(line, w / 2, ys[i]);
    });
  }
  ctx.fillStyle = spec.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, ys[i]);
  });
  return captionLayerFrom(ctx.getImageData(0, 0, w, h).data);
}
