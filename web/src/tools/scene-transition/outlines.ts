/**
 * 剪影的外形（本站自己畫的，程式產生）：花瓣兩種、羽毛、蝙蝠（翅膀可以拍動）。
 * 座標以原點為中心、大約在半徑 1 以內，y 向下；回傳 [x0, y0, x1, y1, …]（不重複起點）。
 */

type Pt = readonly [number, number];

/** 三次貝茲曲線取樣（不含起點，含終點） */
function cubic(out: number[], p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push(
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    );
  }
}

/** 以 y 軸左右對稱：先畫右半邊（從下方的中心往上到上方的中心），左半邊照鏡像倒著接回來 */
function mirrored(right: number[]): Float64Array {
  const n = right.length / 2;
  const out: number[] = [...right];
  for (let i = n - 2; i >= 1; i--) out.push(-right[i * 2], right[i * 2 + 1]);
  return Float64Array.from(out);
}

/**
 * 櫻花瓣：下端尖、往上漸寬、上緣中間有一個 V 形的缺口（最寬約 0.74）。
 */
export const PETAL_SAKURA: Float64Array = (() => {
  const r: number[] = [0, 0.96];
  cubic(r, [0, 0.96], [0.42, 0.7], [0.8, 0.12], [0.66, -0.46], 10);
  cubic(r, [0.66, -0.46], [0.58, -0.78], [0.36, -0.94], [0.2, -0.9], 6);
  r.push(0.09, -0.78, 0, -0.62);
  return mirrored(r);
})();

/**
 * 圓瓣（玫瑰、山茶一類）：下端收窄、上半部圓鼓（最寬約 0.82），上緣略帶波浪。
 */
export const PETAL_ROUND: Float64Array = (() => {
  const r: number[] = [0, 0.95];
  cubic(r, [0, 0.95], [0.5, 0.78], [0.9, 0.2], [0.8, -0.38], 10);
  cubic(r, [0.8, -0.38], [0.72, -0.8], [0.4, -0.98], [0.18, -0.9], 8);
  cubic(r, [0.18, -0.9], [0.1, -0.86], [0.05, -0.93], [0, -0.92], 3);
  return mirrored(r);
})();

/**
 * 羽毛：上端尖、羽片左右不對稱（右寬約 0.44、左寬約 0.36），兩側各有一道裂口，下端接一段細羽軸。
 */
export const FEATHER: Float64Array = (() => {
  const p: number[] = [];
  /* 羽軸下端（右側）往上 */
  p.push(0.025, 1, 0.03, 0.62);
  /* 右側羽片：下緣 → 裂口 → 上半 → 尖端 */
  cubic(p, [0.03, 0.62], [0.3, 0.55], [0.44, 0.32], [0.43, 0.12], 6);
  p.push(0.3, 0.06);
  cubic(p, [0.3, 0.06], [0.42, -0.08], [0.42, -0.44], [0.28, -0.68], 7);
  cubic(p, [0.28, -0.68], [0.18, -0.86], [0.09, -0.96], [0.02, -1], 5);
  /* 左側羽片：尖端 → 上半 → 裂口 → 下緣 */
  cubic(p, [0.02, -1], [-0.12, -0.9], [-0.3, -0.7], [-0.35, -0.42], 6);
  p.push(-0.24, -0.34);
  cubic(p, [-0.24, -0.34], [-0.38, -0.16], [-0.38, 0.22], [-0.3, 0.42], 7);
  cubic(p, [-0.3, 0.42], [-0.22, 0.58], [-0.1, 0.62], [-0.03, 0.62], 5);
  p.push(-0.025, 1);
  return Float64Array.from(p);
})();

/** 兩點之間往上（翅膀內側）凹進去的扇形缺口（蝙蝠翅膀後緣的一節）：不含起點，含終點 */
function scallop(out: number[], a: Pt, b: Pt, depth: number): void {
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const bulge = Math.sin(Math.PI * t) * depth;
    out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - bulge);
  }
}

/**
 * 蝙蝠（翼展 −1～1，身體在原點）。flap：翅膀的位置，−1＝往上抬到最高、0＝平展、1＝往下壓到最低。
 * 翅膀抬起或壓下時翼展略為縮短。
 */
export function batOutline(flap: number): Float64Array {
  const f = Math.max(-1, Math.min(1, flap));
  const lift = f * 0.5;
  const tipX = 1 - 0.2 * Math.abs(f);
  const r: number[] = [0, 0.4];
  /* 身體下半 → 腰 */
  r.push(0.07, 0.34, 0.12, 0.2);
  /* 後緣：從腰往翅膀尖，三節扇形缺口 */
  const hip: Pt = [0.12, 0.2];
  const f1: Pt = [0.34 * tipX + 0.03, 0.2 + lift * 0.35];
  const f2: Pt = [0.6 * tipX, 0.14 + lift * 0.65];
  const tip: Pt = [tipX, -0.06 + lift];
  scallop(r, hip, f1, 0.09);
  scallop(r, f1, f2, 0.1);
  scallop(r, f2, tip, 0.11);
  /* 前緣：翅膀尖 → 腕 → 肩（往上拱） */
  cubic(
    r,
    tip,
    [0.84 * tipX, -0.26 + lift * 0.9],
    [0.5 * tipX, -0.34 + lift * 0.55],
    [0.15, -0.16],
    6,
  );
  /* 耳朵與頭頂 */
  r.push(0.13, -0.26, 0.12, -0.46, 0.05, -0.31, 0, -0.29);
  return mirrored(r);
}

/** 圓或橢圓（n 個點） */
export function ellipseOutline(rx: number, ry: number, n = 24): Float64Array {
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out[i * 2] = Math.cos(a) * rx;
    out[i * 2 + 1] = Math.sin(a) * ry;
  }
  return out;
}
