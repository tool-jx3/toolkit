/**
 * 從圖片讀回種子（規格 1.12、3.16）：找出圖片裡刻了資料的同心圓，讀出位元，再組成封包。
 * - 墨跡：背景色＝四邊每 4 px 取一點的中位數；和背景的色差（RGB 差的總和）用大津法分成墨跡與背景（門檻夾在 40～300）；
 *   背景是透明的圖用不透明度（＞110）。
 * - 候選中心：小而方正的墨跡塊（同心圓的中心點），再加上圖片中央、點過的位置。
 * - 每個候選：沿 180 個方向找第一圈、擬合圓心（最多 5 次）；再沿半徑量每一圈的覆蓋率找出各圈（前兩圈要是實線），
 *   刻資料的圈逐一取樣出一段一段的弧。
 * - 新方式：從最靠近圖片中央（或點的位置）的同心圓開始，照 12 個方向循著線找下一個同心圓（廣度優先），依產生時的順序讀回位元。
 * - 舊方式：每個同心圓是一個斷片（同步弧、方向、位置、長度、CRC-8），多個斷片投票組回封包。
 * 演算法與數值照原作（al1scut/tkmizGeo edb6828），所以讀得出、讀不出的情況也和原作相同（縮放、壓縮的容忍度見 3.16）。
 * 純計算，不依賴 DOM（在 Worker 裡跑）。
 */
import {
  CHUNK_OVERHEAD,
  crc8bits,
  fromBits,
  type Packet,
  parsePacket,
  toBits,
  V2_DIRECTIONS,
} from './code';

const TAU = Math.PI * 2;

export interface DecodeImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** 讀的方式：自動（先新後舊）、只用新方式、只用舊方式 */
export type DecodeMode = 'auto' | 'v2' | 'v1';

/** 圖片要縮到長邊最多幾 px 再讀（原作同） */
export const DECODE_MAX_SIDE = 4000;

/* ---------- 墨跡與候選 ---------- */

/** 墨跡（1）與背景（0） */
export function inkMask(img: DecodeImage): Uint8Array {
  const { width: W, height: H, data: d } = img;
  const m = new Uint8Array(W * H);
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const as: number[] = [];
  const sample = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    rs.push(d[i]);
    gs.push(d[i + 1]);
    bs.push(d[i + 2]);
    as.push(d[i + 3]);
  };
  for (let x = 0; x < W; x += 4) for (const y of [0, H - 1]) sample(x, y);
  for (let y = 0; y < H; y += 4) for (const x of [0, W - 1]) sample(x, y);
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = med(rs);
  const bg = med(gs);
  const bb = med(bs);
  const ba = med(as);
  if (ba < 128) {
    for (let i = 0, j = 0; j < W * H; i += 4, j++) m[j] = d[i + 3] > 110 ? 1 : 0;
    return m;
  }
  const dist = new Uint16Array(W * H);
  const hist = new Float64Array(766);
  for (let i = 0, j = 0; j < W * H; i += 4, j++) {
    const v = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    dist[j] = v;
    hist[v]++;
  }
  /* 大津法 */
  const tot = W * H;
  let sum = 0;
  for (let t = 0; t < 766; t++) sum += t * hist[t];
  let sB = 0;
  let wB = 0;
  let best = 0;
  let th = 90;
  for (let t = 0; t < 766; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = tot - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB;
    const mF = (sum - sB) / wF;
    const bv = wB * wF * (mB - mF) * (mB - mF);
    if (bv > best) {
      best = bv;
      th = t;
    }
  }
  th = Math.max(40, Math.min(th, 300));
  for (let j = 0; j < W * H; j++) m[j] = dist[j] > th ? 1 : 0;
  return m;
}

/** 小而方正的墨跡塊的中心（4 連通；邊長 ≤ 40、長寬差不多、填滿一半以上） */
export function findCandidates(m: Uint8Array, W: number, H: number): [number, number][] {
  const seen = new Uint8Array(W * H);
  const out: [number, number][] = [];
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || seen[i]) continue;
    let sp = 0;
    let area = 0;
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1;
    let y1 = -1;
    let sx = 0;
    let sy = 0;
    let big = false;
    stack[sp++] = i;
    seen[i] = 1;
    while (sp) {
      const j = stack[--sp];
      const x = j % W;
      const y = (j / W) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x1 - x0 > 60 || y1 - y0 > 60) big = true;
      for (const q of [j - 1, j + 1, j - W, j + W]) {
        if (q < 0 || q >= W * H) continue;
        if ((q === j - 1 && x === 0) || (q === j + 1 && x === W - 1)) continue;
        if (m[q] && !seen[q]) {
          seen[q] = 1;
          stack[sp++] = q;
        }
      }
    }
    if (big) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (area < 3 || w > 40 || h > 40) continue;
    if (Math.abs(w - h) > Math.max(2, 0.35 * Math.max(w, h))) continue;
    if (area / (w * h) < 0.5) continue;
    out.push([sx / area, sy / area]);
  }
  return out;
}

/* ---------- 一個同心圓 ---------- */

interface Band {
  r: number;
  /** 這一圈的最高覆蓋率 */
  mx: number;
  half?: number;
  /** 線寬（覆蓋率超過一半的寬度） */
  hw?: number;
  /** 這一圈的弧：起點角度、長度（px） */
  raw?: { a0: number; px: number }[];
}

export interface Analysis {
  cx: number;
  cy: number;
  /** 兩個基準圈的半徑 */
  f: [number, number];
  codeBands: Band[];
  /** 舊方式：每一圈讀到的位元 */
  ringBits: number[][];
  /** 舊方式：同步弧的角度 */
  syncA: number | null;
  lwEst: number;
  outerHalf: number;
  rOut: number;
  /** 新方式的循線用 */
  pslot?: number;
  pres?: number[];
  chunk?: { off: number; len: number; payload: number[]; ori: boolean } | null;
}

type At = (x: number, y: number) => number;

/** 以 (cx, cy) 為中心分析：擬合圓心、找各圈、取樣刻資料的圈（照原作；讀不出時 null） */
export function analyzeAt(cx: number, cy: number, at: At, W: number, H: number): Analysis | null {
  const atF = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const v =
      at(x0, y0) * (1 - fx) * (1 - fy) +
      at(x0 + 1, y0) * fx * (1 - fy) +
      at(x0, y0 + 1) * (1 - fx) * fy +
      at(x0 + 1, y0 + 1) * fx * fy;
    return v >= 0.5;
  };
  for (let it = 0; it < 5; it++) {
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 180; k++) {
      const a = (k / 180) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let r = 0;
      while (r < 40 && at(cx + ca * r, cy + sa * r)) r++;
      let s = -1;
      for (; r < 120; r++) {
        if (at(cx + ca * r, cy + sa * r)) {
          s = r;
          break;
        }
      }
      if (s < 0) continue;
      let e = s;
      while (e < s + 30 && at(cx + ca * e, cy + sa * e)) e++;
      const rr = (s + e) / 2;
      pts.push([cx + ca * rr, cy + sa * rr, rr]);
    }
    if (pts.length < 60) return null;
    const rmed = pts.map((p) => p[2]).sort((a, b) => a - b)[pts.length >> 1];
    const good = pts.filter((p) => Math.abs(p[2] - rmed) < Math.max(2, rmed * 0.12));
    if (good.length < 60) return null;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let sxz = 0;
    let syz = 0;
    let sz = 0;
    const n = good.length;
    for (const [x, y] of good) {
      const z = x * x + y * y;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      sxz += x * z;
      syz += y * z;
      sz += z;
    }
    const A = [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ];
    const B = [sxz, syz, sz];
    const det = (M: number[][]) =>
      M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A);
    if (Math.abs(D) < 1e-9) return null;
    const col = (M: number[][], c: number, v: number[]) =>
      M.map((row, i) => row.map((x, j) => (j === c ? v[i] : x)));
    const ncx = det(col(A, 0, B)) / D / 2;
    const ncy = det(col(A, 1, B)) / D / 2;
    const mv = Math.hypot(ncx - cx, ncy - cy);
    if (mv > 60) return null;
    cx = ncx;
    cy = ncy;
    if (mv < 0.15) break;
  }
  /* 半徑方向的覆蓋率的「山」就是一圈（圈與圈很近時用谷分開） */
  const NA = 720;
  const cov: number[] = [0, 0];
  const peaks: Band[] = [];
  let valley = 1;
  let solids = 0;
  let step = 0;
  let dotEnd = 0;
  const maxR = Math.min(Math.floor(Math.min(cx, cy, W - cx, H - cy)) - 2, 3000);
  const covAt = (r: number) => {
    let c = 0;
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * TAU;
      if (at(cx + Math.cos(a) * r, cy + Math.sin(a) * r)) c++;
    }
    return c / NA;
  };
  for (let r = 2; r <= maxR; r++) {
    cov[r] = covAt(r);
    const q = r - 1;
    /* 先走出中心點 */
    if (!dotEnd) {
      if (cov[r] < 0.06) dotEnd = r;
      else if (r > 60) return null;
      continue;
    }
    if (q >= 2) {
      const v = cov[q];
      valley = Math.min(valley, v);
      if (v > 0.025 && v >= cov[q - 1] && v > cov[r]) {
        /* 用拋物線內插山頂的位置 */
        const a1 = cov[q - 1];
        const a2 = cov[r];
        const den = a1 - 2 * v + a2;
        const rr = q + (den ? (0.5 * (a1 - a2)) / den : 0);
        const prev = peaks[peaks.length - 1];
        if (prev && (rr - prev.r < 2.2 || valley > 0.8 * Math.min(prev.mx, v))) {
          if (v > prev.mx) {
            prev.r = rr;
            prev.mx = v;
          }
        } else if (rr > dotEnd) {
          peaks.push({ r: rr, mx: v });
          if (v > 0.9) solids++;
          if (peaks.length >= 2) {
            const dd = rr - peaks[peaks.length - 2].r;
            step = step ? Math.min(step, dd) : dd;
          }
        }
        valley = 1;
      }
    }
    if (r > 150 && solids < 2) return null;
    if (peaks.length >= 3 && !(peaks[0].mx > 0.9 && peaks[1].mx > 0.9)) return null;
    if (solids >= 2 && step && r - peaks[peaks.length - 1].r > step * 2.5 + 4) break;
  }
  if (peaks.length < 3 || peaks[0].mx < 0.9 || peaks[1].mx < 0.9) return null;
  const bands = peaks;
  const codeBands: Band[] = [];
  for (let i = 2; i < bands.length; i++) {
    const x = bands[i];
    if (x.mx > 0.95 || x.mx < 0.025) break;
    /* 只讀線寬（覆蓋率超過山頂的一半）裡面 */
    const ri = Math.round(x.r);
    let lo = ri;
    let hi = ri;
    while (lo > 2 && cov[lo - 1] > x.mx * 0.5) lo--;
    while (hi + 1 < cov.length && cov[hi + 1] > x.mx * 0.5) hi++;
    const dn = Math.min(x.r - bands[i - 1].r, i + 1 < bands.length ? bands[i + 1].r - x.r : 1e9);
    x.half = Math.max(0.5, Math.min(dn * 0.28, (hi - lo + 1) * 0.3));
    codeBands.push(x);
  }
  if (!codeBands.length) return null;
  const ringBits: number[][] = [];
  let syncA: number | null = null;
  for (const cb of codeBands) {
    const r = cb.r;
    const N = Math.max(360, Math.ceil(TAU * r * 2));
    const half = cb.half as number;
    const on = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let dr = -half; dr <= half + 1e-6; dr += Math.max(0.25, half / 2)) {
        if (atF(cx + ca * (r + dr), cy + sa * (r + dr))) {
          on[k] = 1;
          break;
        }
      }
    }
    const st = on.indexOf(0);
    if (st < 0) {
      ringBits.push([]);
      continue;
    }
    const runs: { s: number; len: number; px: number }[] = [];
    let cur: { s: number; len: number; px: number } | null = null;
    for (let t = 0; t < N; t++) {
      const k = (st + t) % N;
      if (on[k]) {
        if (!cur) cur = { s: t, len: 0, px: 0 };
        cur.len++;
      } else if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
    if (!runs.length) {
      ringBits.push([]);
      continue;
    }
    const pxPer = (TAU * r) / N;
    for (const x of runs) x.px = x.len * pxPer;
    cb.raw = runs.map((x) => ({ a0: (((st + x.s) % N) / N) * TAU, px: x.px }));
    const sync = runs.reduce((a, x) => (x.px > a.px ? x : a), runs[0]);
    const u = sync.px / 7;
    const si = runs.indexOf(sync);
    if (syncA == null) syncA = (((st + sync.s) % N) / N) * TAU;
    const bits: number[] = [];
    for (let t = 1; t < runs.length; t++) {
      const x = runs[(si + t) % runs.length];
      if (x.px < u * 0.45) continue;
      if (x.px > u * 5) break;
      bits.push(x.px < u * 2 ? 0 : 1);
    }
    ringBits.push(bits);
  }
  const hw = (pk: Band) => {
    const ri = Math.round(pk.r);
    let lo = ri;
    let hi = ri;
    while (lo > 2 && cov[lo - 1] > pk.mx * 0.5) lo--;
    while (hi + 1 < cov.length && cov[hi + 1] > pk.mx * 0.5) hi++;
    return hi - lo + 1;
  };
  for (const cb of codeBands) {
    if (!cb.raw) cb.raw = [];
    cb.hw = hw(cb);
  }
  return {
    cx,
    cy,
    f: [bands[0].r, bands[1].r],
    codeBands,
    ringBits,
    syncA,
    lwEst: hw(bands[0]),
    outerHalf: hw(codeBands[codeBands.length - 1]) / 2,
    rOut: codeBands[codeBands.length - 1].r,
  };
}

/* ---------- 讀 ---------- */

export interface DecodedNode {
  cx: number;
  cy: number;
  /** 最外圈 */
  r: number;
  /** 新方式：循線讀到了；舊方式：斷片的檢查碼對了 */
  read: boolean;
  /** 新方式：這個同心圓往外的線（12 個方向；畫標記用） */
  lines?: number[];
  pslot?: number;
  /** 舊方式：第二個基準圈、同步弧的角度、斷片的範圍 */
  f2?: number;
  syncA?: number | null;
  chunk?: { off: number; len: number } | null;
}

export interface DecodeAttempt {
  version: 'v2' | 'v1';
  packet: Packet | null;
  /** 找到的同心圓 */
  nodes: DecodedNode[];
  /** 新方式：循線讀到的同心圓之間的連線 */
  edges: [number, number, number, number][];
  /** 讀到的位元數（新方式）／從頭連續組好的位元數（舊方式） */
  bits: number;
  /** 新方式：推算的短點長度（px） */
  unit?: number;
  /** 新方式：失敗的原因 */
  failure?: 'none' | 'pattern' | 'unreadable';
  /** 舊方式：候選點數、讀出的斷片數、讀到的範圍 */
  candidates?: number;
  chunks?: number;
  ranges?: string[];
}

export interface DecodeResult {
  ok: boolean;
  /** 讀出的種子與設定（ok 時） */
  seed?: string;
  settings?: string;
  /** 試過的方式（自動時新方式讀不出才試舊方式） */
  attempts: DecodeAttempt[];
  /** 圖片的大小（縮過之後） */
  width: number;
  height: number;
  ms: number;
}

function candidatesOf(m: Uint8Array, W: number, H: number, center: [number, number] | null) {
  const cands = findCandidates(m, W, H);
  if (center) cands.unshift(center);
  cands.push([W / 2, H / 2]);
  return cands;
}

/** 新方式：從中央的同心圓開始循線讀 */
function decodeV2(img: DecodeImage, m: Uint8Array, center: [number, number] | null): DecodeAttempt {
  const W = img.width;
  const H = img.height;
  const at: At = (x, y) => {
    x |= 0;
    y |= 0;
    return x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0;
  };
  const nodes: Analysis[] = [];
  for (const [x, y] of candidatesOf(m, W, H, center)) {
    if (nodes.some((f) => Math.hypot(f.cx - x, f.cy - y) < 4)) continue;
    const an = analyzeAt(x, y, at, W, H);
    if (!an) continue;
    if (nodes.some((f) => Math.hypot(f.cx - an.cx, f.cy - an.cy) < 4)) continue;
    /* 新方式的花紋圈覆蓋率高；外面淡的（往外的線之類）不算 */
    const kb: Band[] = [];
    for (const b of an.codeBands) {
      if (b.mx < 0.15) break;
      kb.push(b);
    }
    if (!kb.length) continue;
    an.codeBands = kb;
    const lb = kb[kb.length - 1];
    an.rOut = lb.r;
    an.outerHalf = (lb.hw as number) / 2;
    nodes.push(an);
  }
  const fail = (failure: DecodeAttempt['failure'], bits = 0): DecodeAttempt => ({
    version: 'v2',
    packet: null,
    nodes: nodes.map((n) => ({ cx: n.cx, cy: n.cy, r: n.rOut, read: false })),
    edges: [],
    bits,
    failure,
  });
  if (!nodes.length) return fail('none');
  /* 中央（＝第一個圖形）：最靠近圖片中央（或點的位置）的同心圓 */
  const ref = center ?? [W / 2, H / 2];
  const root = nodes.reduce((a, n) =>
    Math.hypot(n.cx - ref[0], n.cy - ref[1]) < Math.hypot(a.cx - ref[0], a.cy - ref[1]) ? n : a,
  );
  /* 短點的長度：中央的同心圓的弧長分成短、長兩群 */
  const lens = root.codeBands.flatMap((b) => (b.raw ?? []).map((x) => x.px)).sort((a, b) => a - b);
  if (lens.length < 4) return fail('pattern');
  let c1 = lens[0];
  let c2 = lens[lens.length - 1];
  for (let it = 0; it < 20; it++) {
    const A: number[] = [];
    const B: number[] = [];
    for (const v of lens) (Math.abs(v - c1) < Math.abs(v - c2) ? A : B).push(v);
    if (A.length) c1 = A.reduce((a, b) => a + b) / A.length;
    if (B.length) c2 = B.reduce((a, b) => a + b) / B.length;
  }
  const u = c2 > c1 * 2 ? (c1 + c2 / 3) / 2 : c1;
  const lw = Math.max(1, root.lwEst);
  const bits: number[] = [];
  const readRings = (n: Analysis) => {
    const k = n.codeBands.length + 2;
    bits.push(...toBits(Math.max(0, Math.min(3, k - 3)), 2));
    for (const b of n.codeBands) {
      const rr = (b.raw ?? []).slice().sort((x, y) => x.a0 - y.a0);
      if (!rr.length) {
        bits.push(0, 0, 0);
        continue;
      }
      const gaps = rr.map((x, i) => {
        const nx = rr[(i + 1) % rr.length];
        let g = nx.a0 - (x.a0 + x.px / b.r);
        if (g < 0) g += TAU;
        return g * b.r;
      });
      let ci = 0;
      gaps.forEach((g, i) => {
        if (g > gaps[ci]) ci = i;
      });
      const order: number[] = [];
      for (let t = 1; t <= rr.length; t++) order.push((ci + t) % rr.length);
      const st = rr[order[0]].a0;
      bits.push(...toBits(Math.floor((((st % TAU) + TAU) % TAU) / (Math.PI / 4)) % 8, 3));
      order.forEach((idx, j) => {
        bits.push(rr[idx].px > 2 * u ? 1 : 0);
        if (j < order.length - 1) bits.push(gaps[idx] > 2 * u ? 1 : 0);
      });
    }
  };
  /** 外圈再往外一點的一圈：哪些方向有線 */
  const probe = (n: Analysis) => {
    const rho = n.rOut + n.outerHalf + 1.5 * lw + 3;
    const N = Math.ceil(TAU * rho * 3);
    const on = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      on[k] = at(n.cx + Math.cos(a) * rho, n.cy + Math.sin(a) * rho);
    }
    const pres: number[] = new Array(V2_DIRECTIONS).fill(0);
    const st = on.indexOf(0);
    if (st < 0) return { pres, rho };
    let cur = -1;
    for (let t = 0; t <= N; t++) {
      const k = (st + t) % N;
      if (on[k] && t < N) {
        if (cur < 0) cur = t;
      } else if (cur >= 0) {
        const mid = (((st + (cur + t - 1) / 2) % N) / N) * TAU;
        pres[Math.round(mid / (TAU / V2_DIRECTIONS)) % V2_DIRECTIONS] = 1;
        cur = -1;
      }
    }
    return { pres, rho };
  };
  const visited = new Set<Analysis>([root]);
  root.pslot = -1;
  readRings(root);
  const queue = [root];
  const edges: [Analysis, Analysis][] = [];
  while (queue.length) {
    const p = queue.shift() as Analysis;
    const { pres, rho } = probe(p);
    p.pres = pres;
    for (let q = 0; q < V2_DIRECTIONS; q++) {
      if (q === p.pslot) continue;
      bits.push(pres[q]);
    }
    for (let q = 0; q < V2_DIRECTIONS; q++) {
      if (q === p.pslot || !pres[q]) continue;
      const a = (q * TAU) / V2_DIRECTIONS;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let best: Analysis | null = null;
      let bd = 1e9;
      for (const c of nodes) {
        if (visited.has(c)) continue;
        const dx = c.cx - p.cx;
        const dy = c.cy - p.cy;
        const along = dx * ca + dy * sa;
        const perp = Math.abs(-dx * sa + dy * ca);
        if (along <= p.rOut + c.rOut || perp > Math.max(2.5, c.rOut * 0.08)) continue;
        if (along < bd) {
          bd = along;
          best = c;
        }
      }
      if (!best) continue;
      /* 線要一路連到那個同心圓 */
      const e = bd - (best.rOut + best.outerHalf + 1.5 * lw + 2);
      let ink = 0;
      let tot = 0;
      for (let dd = rho; dd <= e; dd += 1) {
        tot++;
        let h = 0;
        for (const o of [-1, 0, 1])
          if (at(p.cx + ca * dd - sa * o, p.cy + sa * dd + ca * o)) {
            h = 1;
            break;
          }
        ink += h;
      }
      if (!tot || ink / tot < 0.9) continue;
      visited.add(best);
      best.pslot = (q + V2_DIRECTIONS / 2) % V2_DIRECTIONS;
      readRings(best);
      queue.push(best);
      edges.push([p, best]);
    }
  }
  const packet = parsePacket(bits);
  return {
    version: 'v2',
    packet,
    nodes: nodes.map((n) => ({
      cx: n.cx,
      cy: n.cy,
      r: n.rOut,
      read: visited.has(n),
      lines: n.pres,
      pslot: n.pslot,
    })),
    edges: edges.map(([a, b]) => [a.cx, a.cy, b.cx, b.cy]),
    bits: bits.length,
    unit: u,
    failure: packet ? undefined : 'unreadable',
  };
}

/** 舊方式的斷片：[1 0 1 有方向][位置 12][長度 10][資料][CRC-8]；有方向時前 3 個位元是同步弧的方向 */
function parseChunk(an: Analysis): Analysis['chunk'] {
  const b = an.ringBits.flat();
  if (b.length < CHUNK_OVERHEAD) return null;
  if (b[0] !== 1 || b[1] !== 0 || b[2] !== 1) return null;
  const ori = b[3] === 1;
  const off = fromBits(b.slice(4, 16));
  const len = fromBits(b.slice(16, 26));
  const ringLen = len - (ori ? 3 : 0);
  if (ringLen < 0 || 26 + ringLen + 8 > b.length) return null;
  const sector = Math.round(((((an.syncA as number) % TAU) + TAU) % TAU) / (Math.PI / 4)) % 8;
  const payload = [...(ori ? toBits(sector, 3) : []), ...b.slice(26, 26 + ringLen)];
  const crc = b.slice(26 + ringLen, 34 + ringLen);
  const ok = crc8bits([...b.slice(0, 26), ...payload]).every((x, i) => x === crc[i]);
  return ok ? { off, len, payload, ori } : null;
}

/** 舊方式：每個同心圓讀一個斷片，同一個位元有好幾個時多數決，從頭連續組回封包 */
function decodeV1(img: DecodeImage, m: Uint8Array, center: [number, number] | null): DecodeAttempt {
  const W = img.width;
  const H = img.height;
  const at: At = (x, y) => {
    x |= 0;
    y |= 0;
    return x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0;
  };
  const cands = candidatesOf(m, W, H, center);
  const found: Analysis[] = [];
  for (const [x, y] of cands) {
    if (found.some((f) => Math.hypot(f.cx - x, f.cy - y) < 4)) continue;
    const an = analyzeAt(x, y, at, W, H);
    if (!an) continue;
    if (found.some((f) => Math.hypot(f.cx - an.cx, f.cy - an.cy) < 4)) continue;
    an.chunk = parseChunk(an);
    found.push(an);
  }
  const v0 = new Uint16Array(4096);
  const v1 = new Uint16Array(4096);
  for (const f of found)
    if (f.chunk) {
      const c = f.chunk;
      c.payload.forEach((bt, i) => {
        const k = c.off + i;
        if (k < 4096) (bt ? v1 : v0)[k]++;
      });
    }
  const bits: number[] = [];
  for (let k = 0; k < 4096; k++) {
    if (!v0[k] && !v1[k]) break;
    bits.push(v1[k] > v0[k] ? 1 : 0);
  }
  const ranges: string[] = [];
  let s0 = -1;
  for (let k = 0; k <= 4096; k++) {
    const h = k < 4096 && (v0[k] || v1[k]);
    if (h && s0 < 0) s0 = k;
    if (!h && s0 >= 0) {
      ranges.push(`${s0}–${k - 1}`);
      s0 = -1;
    }
  }
  return {
    version: 'v1',
    packet: parsePacket(bits),
    nodes: found.map((f) => ({
      cx: f.cx,
      cy: f.cy,
      r: f.codeBands[f.codeBands.length - 1].r,
      read: !!f.chunk,
      f2: f.f[1],
      syncA: f.syncA,
      chunk: f.chunk ? { off: f.chunk.off, len: f.chunk.len } : null,
    })),
    edges: [],
    bits: bits.length,
    candidates: cands.length,
    chunks: found.filter((f) => f.chunk).length,
    ranges,
  };
}

/**
 * 讀一張圖（已經縮到長邊最多 4000 px）。自動＝先新方式，讀不出再舊方式。
 * center：點過的位置（優先當候選，新方式也從最靠近它的同心圓開始）。
 */
export function decodeImage(
  img: DecodeImage,
  mode: DecodeMode,
  center: [number, number] | null = null,
): DecodeResult {
  const t0 = performance.now();
  const m = inkMask(img);
  const attempts: DecodeAttempt[] = [];
  if (mode !== 'v1') attempts.push(decodeV2(img, m, center));
  if (mode === 'v1' || (mode === 'auto' && !attempts[0].packet))
    attempts.push(decodeV1(img, m, center));
  const packet = attempts[attempts.length - 1].packet;
  return {
    ok: !!packet,
    ...(packet ? { seed: packet.seed, settings: packet.settings } : {}),
    attempts,
    width: img.width,
    height: img.height,
    ms: performance.now() - t0,
  };
}

/** 縮到長邊最多 4000 px 的大小（原作同：取整數） */
export function decodeSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, DECODE_MAX_SIDE / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
