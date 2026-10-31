/**
 * 公民 ID 的 DNA 條：由持有人的欄位（編號、名、姓、出生日期、種別）決定的序列——同樣的欄位每次都一樣、
 * 改了欄位就換一組。兩種畫法：雙螺旋（兩條骨架＋鹼基對的橫桿）或 A／C／G／T 字母（6 個一組）。
 * 亂數與雜湊照 CyberDelaai/sinforge-ui（MIT，`67d459a`）：FNV-1a＋mulberry32（本工具 colors.ts 的同一套）。
 */
import { hashString, seededRandom } from '../colors';

export interface DnaFields {
  number: string;
  given: string;
  surname: string;
  dob: string;
  species: string;
}

/** 欄位 → 種子 */
export const dnaSeed = (f: DnaFields): number =>
  hashString([f.number, f.given, f.surname, f.dob, f.species].join('|'));

/** 字母的間距（原生像素） */
export const DNA_PITCH = 21.5;

export interface DnaLetter {
  /** 第幾格（含每組之後的空格） */
  i: number;
  base: 'A' | 'C' | 'G' | 'T';
  accent: boolean;
}

/** 字母：n 格，每 7 格的第 7 格是組與組之間的空格（不畫） */
export function dnaLetters(seed: number, n: number): DnaLetter[] {
  const r = seededRandom(seed);
  const out: DnaLetter[] = [];
  for (let i = 0; i < n; i++) {
    const base = 'ACGT'[Math.floor(r() * 4)] as DnaLetter['base'];
    const accent = r() < 0.12;
    if (i % 7 === 6) continue;
    out.push({ i, base, accent });
  }
  return out;
}

export interface DnaRung {
  x: number;
  /** 上、下兩條半桿的頂端 y */
  ya: number;
  yb: number;
  accentA: boolean;
  accentB: boolean;
}

export interface DnaHelix {
  phase: number;
  /** 骨架在 x 的 y（s＝1 上面那條、−1 下面那條） */
  yAt: (x: number, s: 1 | -1) => number;
  rungs: DnaRung[];
}

/** 雙螺旋：週期 150、振幅 amp，中線 mid；鹼基對每 13 一根（兩條骨架太靠近的地方不畫） */
export function dnaHelix(seed: number, x0: number, x1: number, mid: number, amp: number): DnaHelix {
  const r = seededRandom(seed);
  const P = 150;
  const phase = r() * Math.PI * 2;
  const yAt = (x: number, s: 1 | -1) =>
    mid + s * amp * Math.sin(((x - x0) / P) * Math.PI * 2 + phase);
  const rungs: DnaRung[] = [];
  for (let x = x0 + 6; x < x1 - 4; x += 13) {
    const ya = yAt(x, 1);
    const yb = yAt(x, -1);
    if (Math.abs(ya - yb) < 6) continue;
    rungs.push({ x, ya, yb, accentA: r() < 0.18, accentB: r() < 0.18 });
  }
  return { phase, yAt, rungs };
}
