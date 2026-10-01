/**
 * 畫質等級決定輸出尺寸（G2：動態背景）：四段畫質 × 五種比例的尺寸上限表；
 * 「原始尺寸」時從同一畫質的五個尺寸裡挑長寬比最接近的當外框，把原圖等比縮小放進去（不放大；最高畫質不設上限）。
 */

export type AspectId = '16:9' | '8:5' | '4:3' | '3:2' | '1:1';
export type QualityLevel = 'minimum' | 'light' | 'standard' | 'high';

export const ASPECT_IDS: readonly AspectId[] = ['16:9', '8:5', '4:3', '3:2', '1:1'];
export const QUALITY_LEVELS: readonly QualityLevel[] = ['minimum', 'light', 'standard', 'high'];

interface Size {
  width: number;
  height: number;
}

/** 各畫質的尺寸上限（寬 × 高，px） */
export const QUALITY_SIZE_TABLE: Record<QualityLevel, Record<AspectId, Size>> = {
  minimum: {
    '16:9': { width: 768, height: 432 },
    '8:5': { width: 768, height: 480 },
    '4:3': { width: 640, height: 480 },
    '3:2': { width: 720, height: 480 },
    '1:1': { width: 640, height: 640 },
  },
  light: {
    '16:9': { width: 960, height: 540 },
    '8:5': { width: 960, height: 600 },
    '4:3': { width: 800, height: 600 },
    '3:2': { width: 900, height: 600 },
    '1:1': { width: 800, height: 800 },
  },
  standard: {
    '16:9': { width: 1280, height: 720 },
    '8:5': { width: 1280, height: 800 },
    '4:3': { width: 1024, height: 768 },
    '3:2': { width: 1200, height: 800 },
    '1:1': { width: 1024, height: 1024 },
  },
  high: {
    '16:9': { width: 1920, height: 1080 },
    '8:5': { width: 1920, height: 1200 },
    '4:3': { width: 1600, height: 1200 },
    '3:2': { width: 1800, height: 1200 },
    '1:1': { width: 1600, height: 1600 },
  },
};

/** 各畫質的 WebP 有損品質（瀏覽器的 0～1） */
export const QUALITY_WEBP: Record<QualityLevel, number> = {
  minimum: 0.62,
  light: 0.72,
  standard: 0.82,
  high: 0.92,
};

/** 長寬比最接近的比例（以比值的對數距離比較；直式圖會選到 1:1） */
export function nearestAspect(width: number, height: number): AspectId {
  const r = Math.log(Math.max(1, width) / Math.max(1, height));
  let best: AspectId = '16:9';
  let bestD = Infinity;
  for (const id of ASPECT_IDS) {
    const s = QUALITY_SIZE_TABLE.standard[id];
    const d = Math.abs(r - Math.log(s.width / s.height));
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** 等比縮小放進 box（不放大），四捨五入、至少 2 px */
export function fitWithin(source: Size, box: Size): Size {
  const k = Math.min(
    1,
    box.width / Math.max(1, source.width),
    box.height / Math.max(1, source.height),
  );
  return {
    width: Math.max(2, Math.round(source.width * k)),
    height: Math.max(2, Math.round(source.height * k)),
  };
}

/**
 * 輸出尺寸：
 * - 選比例：表中那格的尺寸（圖片之後再蓋滿、置中裁切）；
 * - 原始尺寸＋最高畫質：原圖尺寸（不設上限）；
 * - 原始尺寸＋其他畫質：同一畫質裡長寬比最接近的尺寸當外框，原圖等比縮小放進去。
 * 例：1600 × 1200、標準 → 1024 × 768；720 × 1280、輕量 → 450 × 800；640 × 360、任何畫質 → 640 × 360。
 */
export function qualityOutputSize(
  quality: QualityLevel,
  aspect: AspectId | 'original',
  source: Size,
): Size {
  if (aspect !== 'original') return { ...QUALITY_SIZE_TABLE[quality][aspect] };
  if (quality === 'high') {
    return {
      width: Math.max(2, Math.round(source.width)),
      height: Math.max(2, Math.round(source.height)),
    };
  }
  return fitWithin(source, QUALITY_SIZE_TABLE[quality][nearestAspect(source.width, source.height)]);
}
