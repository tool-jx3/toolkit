/**
 * 摩斯環（規格 1.11 的 F65～F72、3.11）：把一圈（或一段弧）排成摩斯電碼的短點與長點。
 * - 自訂文字：照國際摩斯電碼（英文字母、數字與 . , ? / - ! @），大小寫不分；空白（含全形空白）是單字間隔；
 *   表裡沒有的字（中文、日文、其他符號）略過。全形的英數字先換成半形（本站加的，D14）。
 *   一個能轉的字都沒有時當成沒有填（隨機；原作會停住畫不下去，D13）。
 * - 沒有自訂文字時隨機：每個字母 1～5 個符號，各自以「長點的比例」決定長或短，字母後以「單字間隔的機率」接單字間隔、否則接字母間隔。
 * 亂數的取用順序、長度的算法照原作（同一個種子才會畫出同一張）。
 */
import type { Random } from '@/core/timeline/random';

/** 國際摩斯電碼（公開的標準） */
export const MORSE_CODE: Readonly<Record<string, string>> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  '/': '-..-.',
  '-': '-....-',
  '!': '-.-.--',
  '@': '.--.-.',
};

/** 短點、長點、字母間隔、單字間隔 */
export type MorseToken = '.' | '-' | 'l' | 'w';

/** 一個符號在圈上的位置（弧度，從 a0 到 a1）；letter＝第幾個字母（摩斯橋一個字母架一座） */
export interface MorseSeg {
  a0: number;
  a1: number;
  dot: boolean;
  dash: boolean;
  letter: number;
  /** 刻種子（舊方式）的同步弧（code.ts；刻資料的弧 dot、dash 都是 false、letter 是 −1） */
  sync?: boolean;
}

/** 排列用的設定（長度都以短點為單位） */
export interface MorseLayout {
  /** 長點＝短點 × dash */
  dash: number;
  /** 同一個字母裡的間隔 */
  gap: number;
  /** 字母之間的間隔 */
  letterGap: number;
  /** 單字之間的間隔 */
  wordGap: number;
  /** 隨機時長點的比例（0～1） */
  pDash: number;
  /** 隨機時接單字間隔的機率（0～1） */
  pWord: number;
}

const isSpace = (ch: string) => ch === ' ' || ch === '　';

/** 文字 → 符號列（字母之後接字母間隔；空白換成單字間隔；最後一個字母間隔拿掉） */
export function textToMorse(text: string): MorseToken[] {
  const out: MorseToken[] = [];
  for (const ch of text.normalize('NFKC').toUpperCase()) {
    if (isSpace(ch)) {
      if (out.length && out[out.length - 1] !== 'w') {
        if (out[out.length - 1] === 'l') out.pop();
        out.push('w');
      }
      continue;
    }
    const code = MORSE_CODE[ch];
    if (!code) continue;
    for (const e of code) out.push(e as MorseToken);
    out.push('l');
  }
  if (out.length && out[out.length - 1] === 'l') out.pop();
  return out;
}

/** 自訂文字用的符號列；沒有填、或一個能轉的字都沒有時是 null（隨機） */
export function morseTokens(text: string): MorseToken[] | null {
  if (!text.trim()) return null;
  const tokens = textToMorse(text);
  return tokens.some((t) => t === '.' || t === '-') ? tokens : null;
}

/** 自訂文字裡沒有摩斯電碼、會略過的字（不重複，依出現順序；空白不算） */
export function unsupportedChars(text: string): string[] {
  const seen = new Set<string>();
  for (const ch of text.normalize('NFKC').toUpperCase())
    if (!isSpace(ch) && !MORSE_CODE[ch] && !/\s/.test(ch)) seen.add(ch);
  return [...seen];
}

/** 符號列 → 「.-」「/」表示（說明用：字母之間空一格，單字之間「 / 」） */
export function morseNotation(tokens: readonly MorseToken[]): string {
  return tokens.map((t) => (t === 'l' ? ' ' : t === 'w' ? ' / ' : t)).join('');
}

/**
 * 在半徑 r、從角度 a0 起長 span（弧度）的弧上排符號。弧長＝r × span；短於兩個短點時什麼都不排（那一圈什麼都不畫）。
 * 自訂文字時從符號列的隨機位置開始，排到最後一個符號後接單字間隔，再從頭開始；排到弧的結尾（留一個符號內間隔）為止。
 */
export function layoutMorse(
  r: number,
  a0: number,
  span: number,
  unit: number,
  layout: MorseLayout,
  rng: Random,
  tokens: readonly MorseToken[] | null,
): MorseSeg[] {
  const segs: MorseSeg[] = [];
  const length = r * span;
  if (length < unit * 2) return segs;
  const n = tokens?.length ?? 0;
  let ti = tokens ? rng.int(0, n - 1) : 0;
  let buffer: MorseToken[] = [];

  /** 隨機的一個字母：1～5 個符號，最後接字母或單字間隔 */
  const randomLetter = (): MorseToken[] => {
    const count = rng.int(1, 5);
    const letter: MorseToken[] = [];
    for (let i = 0; i < count; i++) letter.push(rng.next() < layout.pDash ? '-' : '.');
    letter.push(rng.next() < layout.pWord ? 'w' : 'l');
    return letter;
  };
  const nextToken = (): MorseToken => {
    if (tokens) {
      const t = tokens[ti % n];
      ti++;
      return t;
    }
    if (!buffer.length) buffer = randomLetter();
    return buffer.shift() as MorseToken;
  };

  let pos = 0;
  let pendingGap = 0;
  let afterSymbol = false;
  let letter = 0;
  for (let guard = 0; pos < length && guard < 100000; ) {
    guard++;
    const t = nextToken();
    if (t === 'l' || t === 'w') {
      pendingGap = (t === 'l' ? layout.letterGap : layout.wordGap) * unit;
      if (afterSymbol) letter++;
      afterSymbol = false;
      continue;
    }
    const gap = afterSymbol ? layout.gap * unit : pendingGap;
    pendingGap = 0;
    const len = t === '-' ? layout.dash * unit : unit;
    const s = pos + gap;
    const e = s + len;
    if (e > length - layout.gap * unit) break;
    segs.push({ a0: a0 + s / r, a1: a0 + e / r, dot: t === '.', dash: t === '-', letter });
    pos = e;
    afterSymbol = true;
    /* 自訂文字排完一輪：接單字間隔，下一輪算新的字母 */
    if (tokens && ti % n === 0) {
      pendingGap = layout.wordGap * unit;
      afterSymbol = false;
      letter++;
    }
  }
  return segs;
}
