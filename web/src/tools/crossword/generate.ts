/**
 * 排出填字遊戲（規格 3.4～3.6）。純函式；亂數由呼叫端給（預設 Math.random），同樣的候選與同樣的亂數序列
 * 得到與原作相同的盤面（單元測試以原作算出的對照值確認）。
 *
 * - weightedPool：依出現次數、提示長度與亂數打分數，取前「目標數 × 3」個候選。
 * - placeWords：最多試 20 次，每次洗牌後第一個詞橫放在原點，其餘的詞只放在能與盤面交叉的位置
 *   （交叉最多的位置；相同時先找到的），一輪放不進任何詞就停；留下放最多詞的那一次。
 * - assignHints：依擺放順序，每個詞用還沒被別的詞用過的句子當提示。
 * - numberWords：依擺放順序編號；同一格開始的橫向、直向詞共用一個號碼。
 */
import type { Candidate } from './extract';

export type Rng = () => number;
export type Dir = 'across' | 'down';

/** 一個排進盤面的詞（座標以盤面左上角為 0） */
export interface PlacedWord {
  answer: string;
  hint: string;
  x: number;
  y: number;
  dir: Dir;
  num: number;
}

export interface Puzzle {
  width: number;
  height: number;
  /** 依擺放順序 */
  words: PlacedWord[];
}

/** 一格（空格是 null） */
export interface Cell {
  char: string;
  num: number | null;
}

/** 試幾次排列（原作 20） */
export const MAX_ATTEMPTS = 20;
/** 自己列答案時試幾次（新版；目標是排進所有答案，多試幾次比較容易排完） */
export const LIST_ATTEMPTS = 100;
/** 候選數＝目標數 × 3 */
export const POOL_FACTOR = 3;
/** 亂數在分數裡的比重（原作 0.3） */
export const RANDOM_WEIGHT = 0.3;

const chars = (s: string): string[] => Array.from(s);

/** 固定種子的亂數（mulberry32）：開頁的範例盤面、測試用 */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates 洗牌（從最後一個往前，與原作相同的亂數用法） */
export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface PoolOptions {
  /** 目標單字數 */
  target: number;
  /** 出現次數的比重 0～100 */
  freqWeight: number;
  /** 提示長度的比重 0～100 */
  lenWeight: number;
}

/**
 * 候選池：分數＝出現次數 ÷ 最多次數 × 次數比重 ＋ 提示長度 ÷ 最長提示 × 長度比重 ＋ 亂數 × 0.3，
 * 由高到低取前 target × 3 個。每個候選依序用掉一個亂數。
 */
export function weightedPool(words: readonly Candidate[], o: PoolOptions, rng: Rng): Candidate[] {
  if (words.length === 0) return [];
  let maxCount = Number.NEGATIVE_INFINITY;
  let maxLength = Number.NEGATIVE_INFINITY;
  for (const w of words) {
    if (w.count > maxCount) maxCount = w.count;
    if (w.hint.length > maxLength) maxLength = w.hint.length;
  }
  maxCount = maxCount || 1;
  maxLength = maxLength || 1;
  const freqW = o.freqWeight / 100;
  const lenW = o.lenWeight / 100;
  const scored = words.map((w) => {
    const freqScore = w.count / maxCount;
    const lenScore = w.hint.length / maxLength;
    const randomScore = rng();
    return { w, score: freqW * freqScore + lenW * lenScore + randomScore * RANDOM_WEIGHT };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(scored.length, o.target * POOL_FACTOR)).map((s) => s.w);
}

interface Placement {
  x: number;
  y: number;
  /** 0＝橫、1＝直 */
  dir: 0 | 1;
}

interface RawPlaced extends Placement {
  word: Candidate;
}

const key = (x: number, y: number) => `${x},${y}`;

/** 能不能放：重疊的格子字要相同；空格的兩側（與詞垂直的方向）不能有字；詞的前後一格要空著 */
function canPlace(
  grid: Map<string, string>,
  word: readonly string[],
  sx: number,
  sy: number,
  dir: 0 | 1,
): number | null {
  let intersections = 0;
  const at = (x: number, y: number) => grid.get(key(x, y));
  for (let i = 0; i < word.length; i++) {
    const x = dir === 0 ? sx + i : sx;
    const y = dir === 0 ? sy : sy + i;
    const cur = at(x, y);
    if (cur) {
      if (cur !== word[i]) return null;
      intersections++;
    } else if (dir === 0) {
      if (at(x, y - 1) || at(x, y + 1)) return null;
    } else if (at(x - 1, y) || at(x + 1, y)) return null;
    if (dir === 0) {
      if (i === 0 && at(x - 1, y)) return null;
      if (i === word.length - 1 && at(x + 1, y)) return null;
    } else {
      if (i === 0 && at(x, y - 1)) return null;
      if (i === word.length - 1 && at(x, y + 1)) return null;
    }
  }
  return intersections;
}

/** 一次排列（3.4） */
function attempt(shuffled: readonly Candidate[], target: number): RawPlaced[] {
  const grid = new Map<string, string>();
  const placed: RawPlaced[] = [];
  const put = (word: readonly string[], p: Placement) => {
    for (let j = 0; j < word.length; j++)
      grid.set(key(p.dir === 0 ? p.x + j : p.x, p.dir === 0 ? p.y : p.y + j), word[j]);
  };
  const first = shuffled[0];
  put(chars(first.answer), { x: 0, y: 0, dir: 0 });
  placed.push({ word: first, x: 0, y: 0, dir: 0 });
  let count = 1;
  let unplaced = shuffled.slice(1);
  let progress = true;
  while (progress && count < target && unplaced.length > 0) {
    progress = false;
    const next: Candidate[] = [];
    for (let i = 0; i < unplaced.length && count < target; i++) {
      const cand = unplaced[i];
      const word = chars(cand.answer);
      let best: (Placement & { n: number }) | null = null;
      for (const [coord, ch] of grid) {
        const comma = coord.indexOf(',');
        const gx = Number(coord.slice(0, comma));
        const gy = Number(coord.slice(comma + 1));
        for (let j = 0; j < word.length; j++) {
          if (word[j] !== ch) continue;
          const across = canPlace(grid, word, gx - j, gy, 0);
          if (across !== null && across > 0 && (!best || across > best.n))
            best = { x: gx - j, y: gy, dir: 0, n: across };
          const down = canPlace(grid, word, gx, gy - j, 1);
          if (down !== null && down > 0 && (!best || down > best.n))
            best = { x: gx, y: gy - j, dir: 1, n: down };
        }
      }
      if (best) {
        put(word, best);
        placed.push({ word: cand, x: best.x, y: best.y, dir: best.dir });
        count++;
        progress = true;
      } else next.push(cand);
    }
    unplaced = next;
  }
  return placed;
}

/** 最多試 MAX_ATTEMPTS 次，留下放最多詞的那一次（相同時留先試的）；放滿目標就停 */
export function placeWords(
  pool: readonly Candidate[],
  target: number,
  rng: Rng,
  attempts = MAX_ATTEMPTS,
): RawPlaced[] {
  if (pool.length === 0) return [];
  let best: RawPlaced[] = [];
  for (let a = 0; a < attempts; a++) {
    const placed = attempt(shuffle(pool, rng), target);
    if (placed.length > best.length) best = placed;
    if (best.length >= target) break;
  }
  return best;
}

/** 提示：依擺放順序，用第一句還沒被用過的句子；全部用過時用第一句（3.5） */
export function assignHints(placed: readonly RawPlaced[]): string[] {
  const used = new Set<string>();
  return placed.map((p) => {
    const hint = p.word.sentences.find((s) => !used.has(s)) ?? p.word.sentences[0] ?? '';
    used.add(hint);
    return hint;
  });
}

/**
 * 移到以左上角為 0 的座標、依擺放順序編號（3.6）。同一格開始的詞共用號碼。
 * 原作比對「同一格」時用字串開頭比對，(1,2) 會誤認成 (1,20)；新版比對完整的座標（5. D5）。
 */
export function finishPuzzle(placed: readonly RawPlaced[], hints: readonly string[]): Puzzle {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of placed) {
    const len = chars(p.word.answer).length;
    const ex = p.dir === 0 ? p.x + len - 1 : p.x;
    const ey = p.dir === 0 ? p.y : p.y + len - 1;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, ex);
    maxY = Math.max(maxY, ey);
  }
  if (!placed.length) return { width: 0, height: 0, words: [] };
  const numbers = new Map<string, number>();
  let counter = 1;
  const words = placed.map((p, i): PlacedWord => {
    const x = p.x - minX;
    const y = p.y - minY;
    const start = key(x, y);
    const num = numbers.get(start) ?? counter++;
    if (!numbers.has(start)) numbers.set(start, num);
    return {
      answer: p.word.answer,
      hint: hints[i] ?? '',
      x,
      y,
      dir: p.dir === 0 ? 'across' : 'down',
      num,
    };
  });
  return { width: maxX - minX + 1, height: maxY - minY + 1, words };
}

/* ---------- 由盤面算出來的東西 ---------- */

/** 盤面的格子（列 → 欄）；同一格以先排的詞為準，號碼放在詞的第一格 */
export function puzzleCells(p: Puzzle): (Cell | null)[][] {
  const m: (Cell | null)[][] = Array.from({ length: p.height }, () =>
    Array.from({ length: p.width }, () => null),
  );
  for (const w of p.words) {
    const cs = chars(w.answer);
    cs.forEach((ch, i) => {
      const x = w.dir === 'across' ? w.x + i : w.x;
      const y = w.dir === 'across' ? w.y : w.y + i;
      const row = m[y];
      if (!row || x < 0 || x >= p.width) return;
      const cell = row[x];
      if (!cell) row[x] = { char: ch, num: i === 0 ? w.num : null };
      else if (i === 0 && !cell.num) cell.num = w.num;
    });
  }
  return m;
}

/** 橫向、直向的提示清單（依號碼；相同號碼保持擺放順序） */
export function clueLists(p: Puzzle): { across: PlacedWord[]; down: PlacedWord[] } {
  const by = (dir: Dir) => p.words.filter((w) => w.dir === dir).sort((a, b) => a.num - b.num);
  return { across: by('across'), down: by('down') };
}

/** 提示裡的一段：一般文字，或答案出現的地方（題目蓋成 ○、解答標出答案） */
export interface HintRun {
  text: string;
  answer: boolean;
}

/** 提示裡出現答案的地方全部標出（區分大小寫，從左到右不重疊，同原作） */
export function hintRuns(hint: string, answer: string, reveal: boolean): HintRun[] {
  if (!answer) return [{ text: hint, answer: false }];
  const mask = '○'.repeat(chars(answer).length);
  const out: HintRun[] = [];
  let from = 0;
  for (;;) {
    const at = hint.indexOf(answer, from);
    if (at < 0) break;
    if (at > from) out.push({ text: hint.slice(from, at), answer: false });
    out.push({ text: reveal ? answer : mask, answer: true });
    from = at + answer.length;
  }
  if (from < hint.length || !out.length) out.push({ text: hint.slice(from), answer: false });
  return out;
}

/* ---------- 整個流程 ---------- */

export interface BuildResult {
  puzzle: Puzzle | null;
  /** 候選單字數（文字模式）或有效的答案數（自己列答案） */
  found: number;
  /** 沒排進去的答案（自己列答案時） */
  unplaced: string[];
}

/** 文字模式：候選 → 候選池 → 排列 → 提示 → 編號 */
export function buildFromCandidates(
  words: readonly Candidate[],
  o: PoolOptions,
  rng: Rng,
): BuildResult {
  if (!words.length) return { puzzle: null, found: 0, unplaced: [] };
  const pool = weightedPool(words, o, rng);
  const placed = placeWords(pool, o.target, rng);
  const puzzle = placed.length ? finishPuzzle(placed, assignHints(placed)) : null;
  return { puzzle, found: words.length, unplaced: [] };
}

/** 自己列答案：所有答案都是候選（不打分數），目標＝答案數，最多試 LIST_ATTEMPTS 次 */
export function buildFromEntries(
  entries: readonly ListEntry[],
  rng: Rng,
  attempts = LIST_ATTEMPTS,
): BuildResult {
  if (!entries.length) return { puzzle: null, found: 0, unplaced: [] };
  const pool: Candidate[] = entries.map((e) => ({
    answer: e.answer,
    sentences: [e.hint],
    hint: e.hint,
    count: 1,
  }));
  const placed = placeWords(pool, pool.length, rng, attempts);
  const puzzle = placed.length ? finishPuzzle(placed, assignHints(placed)) : null;
  const done = new Set(placed.map((p) => p.word.answer));
  return {
    puzzle,
    found: entries.length,
    unplaced: entries.filter((e) => !done.has(e.answer)).map((e) => e.answer),
  };
}

/* ---------- 自己列答案的格式 ---------- */

export interface ListEntry {
  answer: string;
  hint: string;
  /** 第幾行（從 1 起） */
  line: number;
}

export interface ListParse {
  entries: ListEntry[];
  /** 答案不到兩個字的行 */
  tooShort: number[];
  /** 和前面重複的答案（只留第一個） */
  duplicates: string[];
  /** 沒有寫提示的答案 */
  noHint: string[];
}

/** 分隔答案與提示的符號（取一行裡最先出現的） */
export const LIST_SEPARATORS = ['：', ':', '\t', '｜', '|'] as const;

/** 一行一個答案：「答案：提示」（也可以用半形冒號、Tab、｜）；答案裡的空白拿掉 */
export function parseList(text: string): ListParse {
  const out: ListParse = { entries: [], tooShort: [], duplicates: [], noHint: [] };
  const seen = new Set<string>();
  text.split(/\r\n?|\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let at = -1;
    for (const sep of LIST_SEPARATORS) {
      const k = line.indexOf(sep);
      if (k >= 0 && (at < 0 || k < at)) at = k;
    }
    const answer = (at < 0 ? line : line.slice(0, at)).replace(/\s+/gu, '');
    const hint = at < 0 ? '' : line.slice(at + 1).trim();
    if (chars(answer).length < 2) {
      out.tooShort.push(i + 1);
      return;
    }
    if (seen.has(answer)) {
      out.duplicates.push(answer);
      return;
    }
    seen.add(answer);
    if (!hint) out.noHint.push(answer);
    out.entries.push({ answer, hint, line: i + 1 });
  });
  return out;
}

/** 盤面用到的所有字（載入字型用） */
export function puzzleText(p: Puzzle | null): string {
  if (!p) return '';
  return p.words.map((w) => `${w.answer}${w.answer.toUpperCase()}${w.hint}${w.num}`).join('');
}
