/**
 * 紙的污漬與摺痕的配置（2026-11-11 從 floor-plan 的 draw/effects.ts 搬來共用；演算法、數值、亂數完全不變，
 * floor-plan 的輸出逐指令相同〔floor-plan-render-hash 測試〕）。
 *
 * 種子 → 幾塊水漬（中心、半徑、外形的起伏、濃淡、旁邊的幾滴）與一兩條摺痕（橫的，有時再一條直的）。
 * 座標都是「紙的比例」（0～1；半徑是紙的短邊的比例），畫法由各工具決定：
 * floor-plan 用 canvas 的漸層畫在地圖上（`drawWear`），scenario-timeline 轉成匯出圖的指令（PNG、SVG 共用）。
 */

/** 一塊水漬 */
export interface WearStain {
  /** 中心（紙的比例 0～1） */
  u: number;
  v: number;
  /** 半徑（紙的短邊的比例） */
  r: number;
  /** 外形的起伏（每個角度的半徑倍率；28 個角度） */
  wobble: number[];
  /** 濃淡（0.6～1） */
  alpha: number;
  /** 旁邊的幾滴（中心的位移與半徑，都是這塊水漬的半徑的倍數） */
  drops: { du: number; dv: number; r: number }[];
}

/** 一條摺痕 */
export interface WearFold {
  /** 'h'＝橫的摺痕（y 固定）；'v'＝直的 */
  o: 'h' | 'v';
  /** 位置（紙的比例） */
  at: number;
  /** 往哪一側暗 */
  side: 1 | -1;
}

export interface WearPlan {
  stains: WearStain[];
  folds: WearFold[];
}

/** 決定論的亂數（xorshift32；同一個種子同樣的數列；和 floor-plan 家具的 `seeded` 相同的演算法） */
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 種子 → 污漬與摺痕的配置（紙的比例座標；同樣的種子結果一樣） */
export function wearPlan(seed: number): WearPlan {
  const rnd = xorshift((seed * 2654435761) ^ 0x3c6ef372);
  const n = 3 + Math.floor(rnd() * 3);
  const stains: WearStain[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = Array.from({ length: 28 }, () => 0);
    const k1 = rnd() * Math.PI * 2;
    const k2 = rnd() * Math.PI * 2;
    for (let j = 0; j < wobble.length; j++) {
      const a = (j / wobble.length) * Math.PI * 2;
      wobble[j] =
        1 + 0.13 * Math.sin(a * 3 + k1) + 0.07 * Math.sin(a * 7 + k2) + 0.05 * (rnd() - 0.5);
    }
    const drops = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
      du: (rnd() - 0.5) * 2.6,
      dv: (rnd() - 0.5) * 2.6,
      r: 0.06 + rnd() * 0.12,
    }));
    stains.push({
      u: 0.08 + rnd() * 0.84,
      v: 0.08 + rnd() * 0.84,
      r: 0.05 + rnd() * 0.11,
      wobble,
      alpha: 0.6 + rnd() * 0.4,
      drops,
    });
  }
  const folds: WearFold[] = [{ o: 'h', at: 0.42 + rnd() * 0.16, side: rnd() < 0.5 ? 1 : -1 }];
  if (rnd() < 0.6) folds.push({ o: 'v', at: 0.38 + rnd() * 0.24, side: rnd() < 0.5 ? 1 : -1 });
  return { stains, folds };
}

/** 污漬的顏色：淺色的紙是茶褐色的水漬，深色的紙是淡淡的白色水痕（RGB） */
export const wearTint = (dark: boolean): readonly [number, number, number] =>
  dark ? [235, 225, 200] : [126, 88, 38];

/** 深色的紙上整體淡一點（強度的倍率） */
export const wearStrength = (strength: number, dark: boolean): number =>
  Math.min(1, strength) * (dark ? 0.55 : 1);
