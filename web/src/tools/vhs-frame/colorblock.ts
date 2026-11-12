/**
 * 數位攝影的第二種編碼「方塊色」（2026-11-12，規格 3.18、F99）：90 年代光碟上 Video for Windows 影片（Microsoft Video 1）的樣子。
 * 參考 NTSCRT `352b4dc`（MIT，© 2026 Finn McKenty；授權全文在同一個資料夾的 UPSTREAM_LICENSE）的 Video 1 編碼，照本站的寫法重寫。
 *
 * 做法：畫面切成 4 × 4 的方塊，每一塊照「畫法表」（BLOCK_STYLES）由省到費挑一種——整塊一個顏色、深淺兩色、四個角各自深淺兩色；
 * 預測影格另外可以整塊沿用上一張。顏色只有每色 32 階（rgb15），所以漸層會一段一段。挑法看誤差預算（blockBudget，由畫質決定）。
 * 解碼器每一塊收到的都是完整的顏色：沿用與遺失的方塊留著解碼器手上原本的內容，哪一塊下次再編，哪一塊就變回對的。
 * 平面、感光雜訊、資料遺失的位置沿用 digital.ts（同 DCT）；和 NTSCRT 不同的地方見規格 D43。
 */
import {
  type CodecSettings,
  cell,
  clonePlanes,
  copyBlock,
  dropBlocks,
  eachMacroblock,
  type FrameCodec,
  hash01,
  type Planes,
  pixelRgb,
  setPixelRgb,
  sourceFrame,
} from './digital';

/* ---------- 顏色與預算 ---------- */

/** 0～255 的值換成每色 32 階（15 位元色）裡最近的一階 */
export const rgb15 = (v: number): number =>
  (Math.round((Math.min(255, Math.max(0, v)) * 31) / 255) * 255) / 31;

/**
 * 一個方塊（16 點 × 紅綠藍＝48 個值）可以花的誤差：(每個值大約可以差幾階)² × 48。
 * 「可以差幾階」隨畫質從 50 直線降到 1——滑桿每移一格，畫面壞的程度差不多一樣多（畫質 0：120000，100：48）。
 */
export const BLOCK_STEP = { atWorst: 50, atBest: 1 } as const;
export function blockBudget(quality: number): number {
  const q = Math.min(1, Math.max(0, quality / 100));
  const step = BLOCK_STEP.atWorst + (BLOCK_STEP.atBest - BLOCK_STEP.atWorst) * q;
  return step * step * 48;
}

/* ---------- 一個方塊的畫法 ---------- */

/** 方塊的畫法：keep＝沿用上一張、flat＝一色、duo＝深淺兩色、quad＝四個角各自深淺兩色（八色） */
export type BlockStyle = 'keep' | 'flat' | 'duo' | 'quad';

/** 方塊裡的點（由左而右、由上而下 0～15） */
const WHOLE: readonly number[] = Array.from({ length: 16 }, (_, i) => i);
/** 四個角的 2 × 2 */
const CORNERS: readonly (readonly number[])[] = [
  [0, 1, 4, 5],
  [2, 3, 6, 7],
  [8, 9, 12, 13],
  [10, 11, 14, 15],
];

/** 畫法表：由省到費；每一種把方塊分成幾區、每一區用幾個顏色 */
const BLOCK_STYLES: readonly {
  style: Exclude<BlockStyle, 'keep'>;
  areas: readonly (readonly number[])[];
  tones: 1 | 2;
}[] = [
  { style: 'flat', areas: [WHOLE], tones: 1 },
  { style: 'duo', areas: [WHOLE], tones: 2 },
  { style: 'quad', areas: CORNERS, tones: 2 },
];

/**
 * 每一種都超過預算時的退路：最細的「四角兩色」也只能做到誤差 Q，就在誤差不超過 max(預算, Q × NEAR_BEST ＋ NEAR_SLACK) 的畫法裡挑最省的。
 * 例：整塊都是 128 的灰、畫質 100（預算 48）：最近的一階是 131.6，一色的誤差 48 × 3.61² ≈ 626.6 已經超過預算，
 * 但四角兩色也是 626.6，退路是 max(48, 657.9)，所以一色就夠。
 */
const NEAR_BEST = 1.05;
const NEAR_SLACK = 1e-3;

const brightness = (px: Float32Array, i: number) =>
  0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2];
/** 第 i 點和 tones 的第 t 個顏色（tones[3t]～[3t ＋ 2]）差的平方和 */
const gap = (px: Float32Array, i: number, tones: Float64Array, t: number) => {
  const dr = px[i * 3] - tones[t * 3];
  const dg = px[i * 3 + 1] - tones[t * 3 + 1];
  const db = px[i * 3 + 2] - tones[t * 3 + 2];
  return dr * dr + dg * dg + db * db;
};

/* 一區的暫存：每一點屬於第幾個顏色（0 深、1 淺）、兩個顏色、加總 */
const side = new Uint8Array(16);
const tones = new Float64Array(6);
const totals = new Float64Array(6);

/** 依 side 把一區的點分成兩組、各自平均寫進 tones；有一組沒有點時回傳 false（tones 不動） */
function averageBySide(px: Float32Array, area: readonly number[]): boolean {
  totals.fill(0);
  const count = [0, 0];
  area.forEach((i, k) => {
    const t = side[k];
    for (let c = 0; c < 3; c++) totals[t * 3 + c] += px[i * 3 + c];
    count[t]++;
  });
  if (count[0] === 0 || count[1] === 0) return false;
  for (let t = 0; t < 2; t++)
    for (let c = 0; c < 3; c++) tones[t * 3 + c] = totals[t * 3 + c] / count[t];
  return true;
}

/** 每一點歸到兩個顏色裡比較近的（一樣近時歸深的） */
function nearestSide(px: Float32Array, area: readonly number[]): void {
  area.forEach((i, k) => {
    side[k] = gap(px, i, tones, 1) < gap(px, i, tones, 0) ? 1 : 0;
  });
}

/**
 * 一區塗上 n 個顏色（1 或 2），寫進 out，回傳誤差平方和。
 * 兩色：比整區平均亮度亮的一組、其他一組 → 兩組的平均色 → 每一點換到比較近的那一色、再平均一次（有一組空了就用前一次的）
 * → 兩色換成 32 階 → 每一點用比較近的。整區一樣亮（分不成兩組）時和一色相同。
 */
export function paintArea(
  px: Float32Array,
  area: readonly number[],
  n: 1 | 2,
  out: Float32Array,
): number {
  let split = false;
  if (n === 2) {
    let sum = 0;
    const lum = area.map((i) => brightness(px, i));
    for (const l of lum) sum += l;
    const mean = sum / area.length;
    lum.forEach((l, k) => {
      side[k] = l > mean ? 1 : 0;
    });
    split = averageBySide(px, area);
    if (split) {
      nearestSide(px, area);
      averageBySide(px, area);
    }
  }
  if (!split) {
    /* 一色（或分不成兩組）：整區的平均色，兩個位置放同一色 */
    for (let c = 0; c < 3; c++) {
      totals[c] = 0;
      for (const i of area) totals[c] += px[i * 3 + c];
      tones[c] = tones[c + 3] = totals[c] / area.length;
    }
  }
  for (let c = 0; c < 6; c++) tones[c] = rgb15(tones[c]);
  nearestSide(px, area);
  let err = 0;
  area.forEach((i, k) => {
    for (let c = 0; c < 3; c++) out[i * 3 + c] = tones[side[k] * 3 + c];
    err += gap(px, i, tones, side[k]);
  });
  return err;
}

/** 照畫法表的一種畫整個方塊，回傳誤差平方和 */
function paintStyle(px: Float32Array, k: number, out: Float32Array): number {
  const { areas, tones: n } = BLOCK_STYLES[k];
  let err = 0;
  for (const area of areas) err += paintArea(px, area, n, out);
  return err;
}

const tries = [new Float32Array(48), new Float32Array(48), new Float32Array(48)];
const costs = new Float64Array(3);

/**
 * 畫一個方塊（px：16 點 × RGB，0～255）：結果寫進 out，回傳用了哪一種畫法。
 * 1. 有上一張（預測影格）而且和上一張差得不超過預算：沿用上一張；
 * 2. 一色就在預算以內：一色；
 * 3. 否則三種都畫，取誤差不超過「退路」（NEAR_BEST）的最省的一種。
 */
export function paintBlock(
  px: Float32Array,
  prev: Float32Array | null,
  budget: number,
  out: Float32Array,
): BlockStyle {
  if (prev) {
    let drift = 0;
    for (let i = 0; i < 48; i++) drift += (px[i] - prev[i]) ** 2;
    if (drift <= budget) {
      out.set(prev);
      return 'keep';
    }
  }
  costs[0] = paintStyle(px, 0, tries[0]);
  let pick = 0;
  if (costs[0] > budget) {
    costs[1] = paintStyle(px, 1, tries[1]);
    costs[2] = paintStyle(px, 2, tries[2]);
    const enough = Math.max(budget, costs[2] * NEAR_BEST + NEAR_SLACK);
    pick = costs[0] <= enough ? 0 : costs[1] <= enough ? 1 : 2;
  }
  out.set(tries[pick]);
  return BLOCK_STYLES[pick].style;
}

/* ---------- 一整格 ---------- */

/** 方塊左上角 (bx, by) 的 16 點：平面 ↔ RGB */
function blockToRgb(p: Planes, bx: number, by: number, out: Float32Array): void {
  for (let k = 0; k < 16; k++) pixelRgb(p, (by + (k >> 2)) * p.w + bx + (k & 3), out, k * 3);
}
function rgbToBlock(p: Planes, bx: number, by: number, px: Float32Array): void {
  for (let k = 0; k < 16; k++)
    setPixelRgb(p, (by + (k >> 2)) * p.w + bx + (k & 3), px[k * 3], px[k * 3 + 1], px[k * 3 + 2]);
}

/** 一個方塊的平面值從 from 搬到 to（不經過 RGB，值一點都不變） */
function moveBlock(from: Planes, to: Planes, bx: number, by: number): void {
  for (let row = 0; row < 4; row++) {
    const at = (by + row) * from.w + bx;
    to.y.set(from.y.subarray(at, at + 4), at);
    to.cb.set(from.cb.subarray(at, at + 4), at);
    to.cr.set(from.cr.subarray(at, at + 4), at);
  }
}

/** 對每一個 4 × 4 方塊做 fn（左上角、第幾塊） */
function eachTile(p: Planes, fn: (bx: number, by: number, t: number) => void): void {
  const cols = p.w / 4;
  for (let by = 0; by < p.h; by += 4)
    for (let bx = 0; bx < p.w; bx += 4) fn(bx, by, (by / 4) * cols + bx / 4);
}

const pxBuf = new Float32Array(48);
const prevBuf = new Float32Array(48);
const outBuf = new Float32Array(48);

/**
 * 編一格：prev（編碼器的上一張）給了是預測影格。編碼器的畫面從上一張（沒有就是這一格）開始，再把重新畫的方塊蓋上去；
 * painted 記哪幾塊是重新畫的（沿用的不算）。
 */
function encodeFrame(
  src: Planes,
  prev: Planes | null,
  budget: number,
): { enc: Planes; painted: Uint8Array } {
  const enc = clonePlanes(prev ?? src);
  const painted = new Uint8Array((src.w / 4) * (src.h / 4));
  eachTile(src, (bx, by, t) => {
    blockToRgb(src, bx, by, pxBuf);
    if (prev) blockToRgb(prev, bx, by, prevBuf);
    if (paintBlock(pxBuf, prev ? prevBuf : null, budget, outBuf) === 'keep') return;
    rgbToBlock(enc, bx, by, outBuf);
    painted[t] = 1;
  });
  return { enc, painted };
}

/**
 * 方塊色的編碼器＋解碼器（介面同 BlockCodec）：關鍵影格每 K 格一個（K＝0：每一格都是關鍵影格）；沒有 datamosh，關鍵影格一定留著。
 * 記著上一次解到哪一格，依序往後要時接著算。平面一律 4:4:4（toPlanes 的 chroma 0）。
 */
export class ColorBlockCodec implements FrameCodec {
  private readonly base: Planes;
  private readonly c: CodecSettings;
  private readonly budget: number;
  private chain: { start: number; n: number; enc: Planes; dec: Planes } | null = null;

  constructor(base: Planes, settings: CodecSettings, quality: number) {
    if (base.sx !== 1 || base.sy !== 1) throw new Error('方塊色的平面要是 4:4:4');
    this.base = base;
    this.c = settings;
    this.budget = blockBudget(quality);
  }

  /** 關鍵影格：整張重新畫；遺失的巨集區塊拿錯位（±24 × ±16 px）的同一格內容補（同 DCT 的關鍵影格，D43） */
  private keyframe(n: number): { enc: Planes; dec: Planes } {
    const { enc } = encodeFrame(sourceFrame(this.base, this.c, n), null, this.budget);
    const dec = clonePlanes(enc);
    eachMacroblock(enc, dropBlocks(enc, this.c, n), (plane, x, y, bw, bh, m) => {
      const g = cell(enc, plane);
      const dx = Math.round((hash01(n, m, 31) - 0.5) * 48) / g.x;
      const dy = Math.round((hash01(n, m, 32) - 0.5) * 32) / g.y;
      copyBlock(enc, dec, plane, x, y, bw, bh, dx, dy);
    });
    return { enc, dec };
  }

  decode(n: number): Planes {
    const K = this.c.gop;
    if (K <= 0) return this.keyframe(n).dec;
    const start = Math.floor(n / K) * K;
    let ch = this.chain;
    if (!ch || ch.start !== start || ch.n > n) {
      const first = this.keyframe(start);
      ch = { start, n: start, enc: first.enc, dec: first.dec };
    }
    for (let m = ch.n + 1; m <= n; m++) {
      const { enc, painted } = encodeFrame(sourceFrame(this.base, this.c, m), ch.enc, this.budget);
      /* 解碼器從自己的上一張開始，只換上這一格重新畫、而且有收到的方塊（遺失的巨集區塊整塊沒收到） */
      const dec = clonePlanes(ch.dec);
      const lost = dropBlocks(enc, this.c, m);
      const mw = enc.w / 16;
      eachTile(enc, (bx, by, t) => {
        if (painted[t] && !lost[(by >> 4) * mw + (bx >> 4)]) moveBlock(enc, dec, bx, by);
      });
      ch.enc = enc;
      ch.dec = dec;
    }
    ch.n = n;
    this.chain = ch;
    return ch.dec;
  }
}
