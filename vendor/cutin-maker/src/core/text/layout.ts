import type { Box } from '../types';

/** 1行の幅を測る手段。Canvas 実装とテスト用スタブを差し替えられるようにしている */
export interface TextMeasurer {
  /** 指定 fontSize での1行の描画幅（px、letterSpacing 込み） */
  measure(line: string, fontSizePx: number): number;
}

export interface LayoutInput {
  lines: string[];
  boxW: number;
  boxH: number;
  lineHeight: number;
  /** ユーザー倍率 0.5〜1.2 */
  scale: number;
  /** 縁取りが外側に食う量（fontSize 比の合計） */
  strokeAllowance: number;
  /** 描画領域のマージン比。既定 0.92 */
  margin?: number;
  minFontSize?: number;
  maxFontSize?: number;
}

export interface TextLayout {
  fontSize: number;
  lineHeightPx: number;
  lines: string[];
  lineWidths: number[];
  /** 行の中心 y 座標（textBaseline='middle' 前提） */
  lineCenters: number[];
  /** テキスト全体の外接矩形（縁取りぶんを含まない） */
  box: Box;
}

/**
 * 自動フォントサイズ。幅・高さの両方が領域に収まる最大サイズを二分探索する。
 * 文字数が変わっても崩れないことが本アプリの核なので、ここは単体テストで担保する。
 */
export function layoutText(input: LayoutInput, m: TextMeasurer): TextLayout {
  const lines = input.lines.length ? input.lines : [''];
  const margin = input.margin ?? 0.92;
  const areaW = input.boxW * margin;
  const areaH = input.boxH * margin;
  const lo0 = input.minFontSize ?? 8;
  const hi0 = input.maxFontSize ?? Math.max(input.boxW, input.boxH) * 1.2;

  const fits = (size: number): boolean => {
    const pad = size * input.strokeAllowance * 2; // 左右／上下ぶん
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, m.measure(line, size));
    const h = lines.length * size * input.lineHeight;
    return maxW + pad <= areaW && h + pad <= areaH;
  };

  let lo = lo0;
  let hi = hi0;
  if (!fits(lo)) {
    // 最小サイズでも入らない（極端に長い文字列）。最小で描いてはみ出させない方針で lo を採用
    hi = lo;
  } else {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
  }
  const base = lo;
  const fontSize = Math.max(1, base * input.scale);
  const lineHeightPx = fontSize * input.lineHeight;
  const lineWidths = lines.map((l) => m.measure(l, fontSize));
  const totalH = lines.length * lineHeightPx;
  const cx = input.boxW / 2;
  const cy = input.boxH / 2;
  const maxW = Math.max(1, ...lineWidths);
  const lineCenters = lines.map((_, i) => cy - totalH / 2 + (i + 0.5) * lineHeightPx);

  return {
    fontSize,
    lineHeightPx,
    lines,
    lineWidths,
    lineCenters,
    box: { x: cx - maxW / 2, y: cy - totalH / 2, w: maxW, h: totalH },
  };
}

/** decorations の stroke 合計から、外側に食う量（fontSize 比）を求める */
export function strokeAllowanceOf(decorations: Array<{ type: string; widthRatio?: number }>, strokeScale: number): number {
  let sum = 0;
  for (const d of decorations) {
    if (d.type === 'stroke' && typeof d.widthRatio === 'number') sum += d.widthRatio * strokeScale;
  }
  return sum;
}
