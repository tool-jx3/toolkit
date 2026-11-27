/**
 * 紙的污漬與摺痕的配置（2026-11-11 從 floor-plan 的 draw/effects.ts 搬來共用；演算法、數值、亂數完全不變，
 * floor-plan 的輸出逐指令相同〔floor-plan-render-hash 測試〕）。
 *
 * 種子 → 幾塊水漬（中心、半徑、外形的起伏、濃淡、旁邊的幾滴）與一兩條摺痕（橫的，有時再一條直的）。
 * 座標都是「紙的比例」（0～1；半徑是紙的短邊的比例），畫法由各工具決定：
 * canvas 的漸層畫法 `drawPaperWear`（2026-11-27 從 floor-plan 的 `drawWear` 搬來，指令完全不變；floor-plan、cross-section 用），
 * scenario-timeline 轉成匯出圖的指令（PNG、SVG 共用）。
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

/** 紙的範圍（目前座標系） */
export interface WearSheet {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 用 canvas 畫污漬與摺痕（2026-11-27 從 floor-plan 的 `draw/effects.ts` 搬來；畫法、數值、指令的順序完全不變，
 * floor-plan 的輸出逐指令相同〔floor-plan-render-hash 測試〕）。
 * sheet＝當成一張紙的範圍（目前座標系；floor-plan 的編輯畫面是世界座標的地圖範圍，匯出是整張圖的像素），
 * strength 0.1～1，dark＝深色的紙（淡淡的白色水痕、整體淡一點）。
 */
export function drawPaperWear(
  c: CanvasRenderingContext2D,
  sheet: WearSheet,
  seed: number,
  strength: number,
  dark: boolean,
): void {
  if (!(strength > 0) || sheet.w <= 0 || sheet.h <= 0) return;
  const plan = wearPlan(seed);
  /* 淺色的紙：茶褐色的水漬；深色的紙：淡淡的白色水痕 */
  const tint = wearTint(dark);
  const rgba = (a: number) => `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${Math.max(0, a)})`;
  const k = wearStrength(strength, dark);
  const m = Math.min(sheet.w, sheet.h);
  c.save();
  for (const s of plan.stains) {
    const cx = sheet.x + s.u * sheet.w;
    const cy = sheet.y + s.v * sheet.h;
    const r = s.r * m;
    c.beginPath();
    s.wobble.forEach((f, j) => {
      const a = (j / s.wobble.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * f;
      const y = cy + Math.sin(a) * r * f;
      if (j) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.closePath();
    const g = c.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.15);
    g.addColorStop(0, rgba(0.05 * k * s.alpha));
    g.addColorStop(0.7, rgba(0.1 * k * s.alpha));
    g.addColorStop(1, rgba(0.2 * k * s.alpha));
    c.fillStyle = g;
    c.fill();
    /* 乾掉的邊緣：一圈深一點的細線 */
    c.strokeStyle = rgba(0.22 * k * s.alpha);
    c.lineWidth = Math.max(r * 0.03, m * 0.0015);
    c.stroke();
    c.fillStyle = rgba(0.14 * k * s.alpha);
    for (const d of s.drops) {
      c.beginPath();
      c.arc(cx + d.du * r, cy + d.dv * r, d.r * r, 0, Math.PI * 2);
      c.fill();
    }
  }
  /* 摺痕：一條細亮線＋一側的暗帶 */
  for (const f of plan.folds) {
    const band = m * 0.012;
    const pos = f.o === 'h' ? sheet.y + f.at * sheet.h : sheet.x + f.at * sheet.w;
    const g =
      f.o === 'h'
        ? c.createLinearGradient(0, pos, 0, pos + band * f.side)
        : c.createLinearGradient(pos, 0, pos + band * f.side, 0);
    g.addColorStop(0, `rgba(0, 0, 0, ${0.16 * k})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    if (f.o === 'h') c.fillRect(sheet.x, Math.min(pos, pos + band * f.side), sheet.w, band);
    else c.fillRect(Math.min(pos, pos + band * f.side), sheet.y, band, sheet.h);
    c.strokeStyle = `rgba(255, 255, 255, ${(dark ? 0.12 : 0.45) * k})`;
    c.lineWidth = Math.max(m * 0.0015, band * 0.15);
    c.beginPath();
    if (f.o === 'h') {
      c.moveTo(sheet.x, pos - (band * f.side) / 6);
      c.lineTo(sheet.x + sheet.w, pos - (band * f.side) / 6);
    } else {
      c.moveTo(pos - (band * f.side) / 6, sheet.y);
      c.lineTo(pos - (band * f.side) / 6, sheet.y + sheet.h);
    }
    c.stroke();
  }
  c.restore();
}
