/**
 * Reed–Solomon 解碼（GF(256)，本原多項式 x⁸＋x⁴＋x³＋x²＋1，生成多項式的根 α⁰～αⁿ⁻¹，同 QR code）。
 * 以歐幾里得演算法求錯誤位置多項式、Chien 搜尋找位置、Forney 算錯誤值。
 * 多項式以陣列表示，第 0 項是最高次的係數。
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const inv = (a: number): number => {
  if (a === 0) throw new RsError();
  return EXP[255 - LOG[a]];
};

export class RsError extends Error {
  constructor() {
    super('reed-solomon');
  }
}

type Poly = number[];

const trim = (p: Poly): Poly => {
  let i = 0;
  while (i < p.length - 1 && p[i] === 0) i++;
  return i ? p.slice(i) : p;
};
const degree = (p: Poly): number => p.length - 1;
const isZero = (p: Poly): boolean => p.length === 1 && p[0] === 0;
const coefficient = (p: Poly, deg: number): number => p[p.length - 1 - deg] ?? 0;

function evalAt(p: Poly, x: number): number {
  if (x === 0) return coefficient(p, 0);
  let y = 0;
  for (const c of p) y = mul(y, x) ^ c;
  return y;
}

function add(a: Poly, b: Poly): Poly {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  const out = long.slice();
  const off = long.length - short.length;
  for (let i = 0; i < short.length; i++) out[off + i] ^= short[i];
  return trim(out);
}

function multiply(a: Poly, b: Poly): Poly {
  if (isZero(a) || isZero(b)) return [0];
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] ^= mul(a[i], b[j]);
  return trim(out);
}

const scale = (p: Poly, k: number): Poly => (k === 0 ? [0] : trim(p.map((c) => mul(c, k))));

function monomialTimes(p: Poly, deg: number, k: number): Poly {
  if (k === 0) return [0];
  return trim([...p.map((c) => mul(c, k)), ...new Array<number>(deg).fill(0)]);
}

const monomial = (deg: number, k: number): Poly =>
  k === 0 ? [0] : [k, ...new Array<number>(deg).fill(0)];

/** 歐幾里得演算法：回傳 [σ（錯誤位置）, ω（錯誤值）] */
function euclidean(a0: Poly, b0: Poly, R: number): [Poly, Poly] {
  let a = a0;
  let b = b0;
  if (degree(a) < degree(b)) [a, b] = [b, a];
  let rLast = a;
  let r = b;
  let tLast: Poly = [0];
  let t: Poly = [1];
  while (2 * degree(r) >= R) {
    const rLastLast = rLast;
    const tLastLast = tLast;
    rLast = r;
    tLast = t;
    if (isZero(rLast)) throw new RsError();
    r = rLastLast;
    let q: Poly = [0];
    const lead = coefficient(rLast, degree(rLast));
    const leadInv = inv(lead);
    while (degree(r) >= degree(rLast) && !isZero(r)) {
      const diff = degree(r) - degree(rLast);
      const k = mul(coefficient(r, degree(r)), leadInv);
      q = add(q, monomial(diff, k));
      r = add(r, monomialTimes(rLast, diff, k));
    }
    t = add(multiply(q, tLast), tLastLast);
    if (degree(r) >= degree(rLast)) throw new RsError();
  }
  const s0 = coefficient(t, 0);
  if (s0 === 0) throw new RsError();
  const k = inv(s0);
  return [scale(t, k), scale(r, k)];
}

function errorLocations(sigma: Poly): number[] {
  const n = degree(sigma);
  if (n === 1) return [coefficient(sigma, 1)];
  const out: number[] = [];
  for (let i = 1; i < 256 && out.length < n; i++) if (evalAt(sigma, i) === 0) out.push(inv(i));
  if (out.length !== n) throw new RsError();
  return out;
}

function errorMagnitudes(omega: Poly, locs: number[]): number[] {
  return locs.map((x, i) => {
    const xInv = inv(x);
    let den = 1;
    for (let j = 0; j < locs.length; j++) if (j !== i) den = mul(den, mul(locs[j], xInv) ^ 1);
    return mul(evalAt(omega, xInv), inv(den));
  });
}

/**
 * 就地修正一個區塊（資料碼字＋錯誤更正碼字，eccLen 個錯誤更正碼字）。
 * 回傳修正了幾個碼字；錯太多（修不回來）時丟 RsError。
 */
export function rsCorrect(block: Uint8Array, eccLen: number): number {
  const poly = Array.from(block);
  const syn = new Array<number>(eccLen).fill(0);
  let clean = true;
  for (let i = 0; i < eccLen; i++) {
    const v = evalAt(poly, EXP[i]);
    syn[eccLen - 1 - i] = v;
    if (v !== 0) clean = false;
  }
  if (clean) return 0;
  const [sigma, omega] = euclidean(monomial(eccLen, 1), trim(syn), eccLen);
  const locs = errorLocations(sigma);
  const mags = errorMagnitudes(omega, locs);
  for (let i = 0; i < locs.length; i++) {
    const pos = block.length - 1 - LOG[locs[i]];
    if (pos < 0) throw new RsError();
    block[pos] ^= mags[i];
  }
  return locs.length;
}

/** 測試用：產生錯誤更正碼字（資料 → eccLen 個碼字） */
export function rsEncode(data: readonly number[], eccLen: number): number[] {
  let gen: Poly = [1];
  for (let i = 0; i < eccLen; i++) gen = multiply(gen, [1, EXP[i]]);
  const rem = new Array<number>(eccLen).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < eccLen; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}
