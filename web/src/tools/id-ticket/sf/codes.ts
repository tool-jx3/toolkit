/**
 * SF 證件的條碼種類（規格 F87）：真的、掃得出來的 Code 128 與 QR code（draw.ts 畫），加上 4 種「看起來像」的碼——
 * EAN-13（零售的樣子：左右與中間的護線比較長、下面 1＋6＋6 位數字）、四態郵政條碼、堆疊式（PDF417 的樣子）、點碼。
 * 看起來像的碼都由編號決定（同一個編號每次畫的一樣），回傳畫在 box 裡的幾何：矩形、圓點、一行字。
 * 做法與數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/codes.js 改寫。
 */
import { seededRandom } from '../colors';
import type { Rect } from './geom';

/** 條碼的種類（存檔的值；'barcode'＝Code 128，沿用以前的值） */
export const SF_CODE_TYPES = ['barcode', 'qr', 'ean13', 'postal', 'stacked', 'dots'] as const;
export type SfCodeType = (typeof SF_CODE_TYPES)[number];

export const isSfCodeType = (v: unknown): v is SfCodeType =>
  (SF_CODE_TYPES as readonly string[]).includes(v as string);

/** 2D 的碼（放在方形的位置） */
export const isSquareCode = (t: SfCodeType): boolean => t === 'qr' || t === 'dots';

/** 真的、掃得出來的碼（才提醒太密） */
export const isScannableCode = (t: SfCodeType): boolean => t === 'barcode' || t === 'qr';

/** 看起來像的碼（這個模組畫的） */
export const isLookalikeCode = (t: SfCodeType): t is LookalikeCode =>
  t === 'ean13' || t === 'postal' || t === 'stacked' || t === 'dots';

export type LookalikeCode = 'ean13' | 'postal' | 'stacked' | 'dots';

export type CodeShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'dot'; cx: number; cy: number; r: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; w: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rngOf = (seed: string) => seededRandom(seed || 'SINFORGE');

/** 一串條與空白的寬（模組數、黑條先）鋪滿 box 的寬 */
function runBars(widths: readonly number[], x: number, y: number, w: number, h: number) {
  const out: CodeShape[] = [];
  const u = w / widths.reduce((a, b) => a + b, 0);
  let at = 0;
  widths.forEach((m, i) => {
    if (i % 2 === 0) out.push({ kind: 'rect', x: x + at * u, y, w: m * u, h });
    at += m;
  });
  return out;
}

/* ---------- EAN-13 ---------- */

/** L 碼的寬（空白先）；R 碼同樣的寬（黑條先）；G 碼是 R 碼倒過來 */
const EAN_L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
const EAN_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

export interface Ean13 {
  /** 13 位數字（編號裡的數字，不夠時由編號補，最後一位是檢查碼） */
  digits: string;
  /** 95 個模組：每一段的寬、是不是黑條、是不是護線 */
  run: { w: number; bar: boolean; guard: boolean }[];
}

export function ean13(seed: string): Ean13 {
  const r = rngOf(seed);
  const d = (String(seed ?? '').match(/[0-9]/g) ?? []).map(Number).slice(0, 12);
  while (d.length < 12) d.push(Math.floor(r() * 10));
  d.push((10 - (d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0) % 10)) % 10);
  const run: Ean13['run'] = [];
  let bar = true;
  const put = (widths: string, guard = false) => {
    for (const w of widths) {
      run.push({ w: Number(w), bar, guard });
      bar = !bar;
    }
  };
  put('111', true);
  for (let i = 1; i <= 6; i++) {
    const L = EAN_L[d[i]];
    put(EAN_PARITY[d[0]][i - 1] === 'L' ? L : [...L].reverse().join(''));
  }
  put('11111', true);
  for (let i = 7; i <= 12; i++) put(EAN_L[d[i]]);
  put('111', true);
  return { digits: d.join(''), run };
}

function eanShapes(b: Rect, seed: string): CodeShape[] {
  const { digits, run } = ean13(seed);
  const txt = b.h >= 80;
  const size = Math.round(b.h * 0.17);
  const lead = txt ? 7 : 0;
  const u = b.w / (95 + lead);
  const x0 = b.x + lead * u;
  const gh = txt ? b.h - size * 0.6 : b.h;
  const dh = txt ? b.h - size * 1.25 : b.h * 0.86;
  const out: CodeShape[] = [];
  let at = 0;
  for (const { w, bar, guard } of run) {
    if (bar) out.push({ kind: 'rect', x: x0 + at * u, y: b.y, w: w * u, h: guard ? gh : dh });
    at += w;
  }
  if (txt) {
    const y = b.y + b.h;
    out.push({ kind: 'text', text: digits[0], x: b.x + 3 * u, y, size, w: 6 * u });
    out.push({ kind: 'text', text: digits.slice(1, 7), x: x0 + 24 * u, y, size, w: 40 * u });
    out.push({ kind: 'text', text: digits.slice(7), x: x0 + 71 * u, y, size, w: 40 * u });
  }
  return out;
}

/* ---------- 四態郵政條碼：從中線往上下長的細條（全高、上半、下半、只有中間三分之一），兩端是全高 ---------- */

function postalShapes(b: Rect, seed: string): CodeShape[] {
  const r = rngOf(seed);
  const out: CodeShape[] = [];
  const n = clamp(Math.round(b.w / (b.h * 0.08)), 24, 65);
  const p = b.w / (n - 0.5);
  const t = b.h / 3;
  for (let i = 0; i < n; i++) {
    const s = i === 0 || i === n - 1 ? 0 : Math.floor(r() * 4);
    const top = s === 0 || s === 1 ? b.y : b.y + t;
    const bot = s === 0 || s === 2 ? b.y + b.h : b.y + 2 * t;
    out.push({ kind: 'rect', x: b.x + i * p, y: top, w: p / 2, h: bot - top });
  }
  return out;
}

/* ---------- 堆疊式（PDF417 的樣子）：幾列 17 模組的碼字，前後固定的起始與結束圖樣排成直條 ---------- */

function stackedShapes(b: Rect, seed: string): CodeShape[] {
  const r = rngOf(seed);
  const out: CodeShape[] = [];
  const rows = clamp(Math.round(b.h / 14), 3, 6);
  const words = Math.max(1, Math.round((b.w / 1.6 - 69) / 17));
  /* 8 段（4 條、4 空白），每段 1～6 模組，加起來 17 */
  const word = () => {
    const e = [1, 1, 1, 1, 1, 1, 1, 1];
    for (let left = 9; left > 0; ) {
      const i = Math.floor(r() * 8);
      if (e[i] < 6) {
        e[i]++;
        left--;
      }
    }
    return e;
  };
  const rh = b.h / rows;
  for (let j = 0; j < rows; j++) {
    const w = [8, 1, 1, 1, 1, 1, 1, 3];
    for (let i = 0; i < words + 2; i++) w.push(...word());
    w.push(7, 1, 1, 3, 1, 1, 1, 2, 1);
    out.push(...runBars(w, b.x, b.y + j * rh, b.w, rh));
  }
  return out;
}

/* ---------- 點碼：格子上的點，四個角實心、上緣與左緣隔一個一點（方向記號） ---------- */

function dotShapes(b: Rect, seed: string): CodeShape[] {
  const r = rngOf(seed);
  const n = 15;
  const m = b.w / n;
  const out: CodeShape[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      let on: boolean;
      if ((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) on = true;
      else if (j === 0) on = i % 2 === 0;
      else if (i === 0) on = j % 2 === 0;
      else on = r() < 0.48;
      if (on)
        out.push({ kind: 'dot', cx: b.x + (i + 0.5) * m, cy: b.y + (j + 0.5) * m, r: m * 0.4 });
    }
  return out;
}

/** 看起來像的碼畫在 box 裡的幾何（點碼的 box 是方形的；由 seed〔編號〕決定） */
export function lookalikeShapes(type: LookalikeCode, box: Rect, seed: string): CodeShape[] {
  switch (type) {
    case 'ean13':
      return eanShapes(box, seed);
    case 'postal':
      return postalShapes(box, seed);
    case 'stacked':
      return stackedShapes(box, seed);
    default:
      return dotShapes(box, seed);
  }
}
