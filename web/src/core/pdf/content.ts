/**
 * 頁面內容串流的掃描（純函式）：追蹤 q／Q／cm 的轉換矩陣，每遇到 `/名稱 Do` 就回報當時的矩陣。
 * 用來量影像在頁面上畫多大（有效 DPI）。文字、路徑等其他運算子都略過；行內影像（BI … ID … EI）整段跳過。
 *
 * 矩陣是 PDF 的 [a b c d e f]（列向量乘矩陣）：`cm` 之後的矩陣 ＝ cm 的矩陣 × 原本的矩陣。
 * 影像的單位正方形畫到頁面上：寬的方向 ＝ (a, b)、高的方向 ＝ (c, d)，長度就是顯示的大小（單位 pt）。
 */

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2（先套 m1 再套 m2） */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

/** 單位正方形經過矩陣之後的寬、高（pt） */
export function unitSize(m: Matrix): { width: number; height: number } {
  return { width: Math.hypot(m[0], m[1]), height: Math.hypot(m[2], m[3]) };
}

/** 點 (x, y) 經過矩陣 */
export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 掃描的工作量上限（記號數）；超過就停（`ScanBudget.exhausted`） */
export interface ScanBudget {
  tokens: number;
  exhausted: boolean;
}

export function scanBudget(tokens = 5_000_000): ScanBudget {
  return { tokens, exhausted: false };
}

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

const isNumberStart = (c: number) => (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46;

/** 運算子名稱（只認得要用的幾個；其他的回傳 0） */
const OP_q = 1;
const OP_Q = 2;
const OP_cm = 3;
const OP_Do = 4;
const OP_BI = 5;
const OP_other = 9;

function opCode(bytes: Uint8Array, start: number, end: number): number {
  const len = end - start;
  const c0 = bytes[start];
  if (len === 1) {
    if (c0 === 0x71) return OP_q;
    if (c0 === 0x51) return OP_Q;
    return OP_other;
  }
  if (len === 2) {
    const c1 = bytes[start + 1];
    if (c0 === 0x63 && c1 === 0x6d) return OP_cm;
    if (c0 === 0x44 && c1 === 0x6f) return OP_Do;
    if (c0 === 0x42 && c1 === 0x49) return OP_BI;
  }
  return OP_other;
}

/**
 * 掃描一段內容串流。
 * @param ctm 開始時的矩陣
 * @param onDo `/名稱 Do` 時呼叫（名稱不含斜線，已解開 #xx 跳脫）
 */
export function scanContent(
  bytes: Uint8Array,
  ctm: Matrix,
  onDo: (name: string, ctm: Matrix) => void,
  budget: ScanBudget = scanBudget(),
): void {
  const stack: Matrix[] = [];
  let m = ctm;
  /* 運算元：最近的 6 個數字、最後一個名稱 */
  const nums: number[] = [];
  let name: string | null = null;
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    if (--budget.tokens < 0) {
      budget.exhausted = true;
      return;
    }
    const c = bytes[i];
    if (WS[c]) {
      i++;
      continue;
    }
    if (c === 0x25) {
      /* % 註解到行尾 */
      while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++;
      continue;
    }
    if (c === 0x28) {
      /* ( 字串 )：括號可以成對巢狀，\ 跳脫 */
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const d = bytes[i];
        if (d === 0x5c) i += 2;
        else {
          if (d === 0x28) depth++;
          else if (d === 0x29) depth--;
          i++;
        }
      }
      nums.length = 0;
      continue;
    }
    if (c === 0x3c) {
      if (bytes[i + 1] === 0x3c) {
        i += 2;
        continue;
      }
      /* <十六進位字串> */
      while (i < n && bytes[i] !== 0x3e) i++;
      i++;
      nums.length = 0;
      continue;
    }
    if (c === 0x3e) {
      i += bytes[i + 1] === 0x3e ? 2 : 1;
      continue;
    }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x29) {
      i++;
      continue;
    }
    if (c === 0x2f) {
      /* /名稱 */
      let j = i + 1;
      while (j < n && !WS[bytes[j]] && !DELIM[bytes[j]]) j++;
      name = decodeName(bytes, i + 1, j);
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !WS[bytes[j]] && !DELIM[bytes[j]]) j++;
    if (j === i) {
      i++;
      continue;
    }
    if (isNumberStart(c)) {
      const v = Number(latin1(bytes, i, j));
      if (Number.isFinite(v)) {
        nums.push(v);
        if (nums.length > 6) nums.shift();
        i = j;
        continue;
      }
    }
    /* 運算子 */
    const op = opCode(bytes, i, j);
    i = j;
    if (op === OP_q) stack.push(m);
    else if (op === OP_Q) m = stack.pop() ?? m;
    else if (op === OP_cm) {
      if (nums.length === 6) {
        m = multiply(nums as unknown as Matrix, m);
      }
    } else if (op === OP_Do) {
      if (name !== null) onDo(name, m);
    } else if (op === OP_BI) {
      i = skipInlineImage(bytes, i);
    }
    nums.length = 0;
    name = null;
  }
}

/** 行內影像：跳到 ID 之後、找前後都是空白的 EI */
function skipInlineImage(bytes: Uint8Array, from: number): number {
  const n = bytes.length;
  let i = from;
  /* 找 ID（前後是空白） */
  for (; i + 1 < n; i++) {
    if (
      bytes[i] === 0x49 &&
      bytes[i + 1] === 0x44 &&
      WS[bytes[i - 1]] &&
      (i + 2 >= n || WS[bytes[i + 2]])
    ) {
      i += 3;
      break;
    }
  }
  for (; i + 1 < n; i++) {
    if (
      bytes[i] === 0x45 &&
      bytes[i + 1] === 0x49 &&
      WS[bytes[i - 1]] &&
      (i + 2 >= n || WS[bytes[i + 2]] || DELIM[bytes[i + 2]])
    ) {
      return i + 2;
    }
  }
  return n;
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let k = start; k < end; k++) s += String.fromCharCode(bytes[k]);
  return s;
}

/** 名稱的 #xx 跳脫 */
function decodeName(bytes: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let k = start; k < end; k++) {
    const ch = bytes[k];
    if (ch === 0x23 && k + 2 < end) {
      const hex = latin1(bytes, k + 1, k + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        s += String.fromCharCode(Number.parseInt(hex, 16));
        k += 2;
        continue;
      }
    }
    s += String.fromCharCode(ch);
  }
  return s;
}
