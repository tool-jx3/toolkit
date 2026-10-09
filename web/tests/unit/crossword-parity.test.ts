/**
 * crossword：與原作逐項對照（規格 3.2～3.6、5. D5）。
 * 對照值 `fixtures/crossword-upstream.json` 由 tests/parity/crossword/upstream.mjs 用原作的 script.js 算出：
 * 同樣的文字 → 同樣的候選單字（出現次數、句子與順序）；同樣的設定與亂數序列 → 同樣的候選池、
 * 同樣的擺放（位置、方向、順序、提示）與盤面。編號只在原作沒有「字串開頭比對」錯誤時相同；
 * 有錯誤的兩組確認新版的編號是對的（同一個號碼只用在同一格）。
 */
import { describe, expect, it } from 'vitest';
import { type Candidate, extractWords } from '../../src/tools/crossword/extract';
import {
  buildFromCandidates,
  hintRuns,
  puzzleCells,
  weightedPool,
} from '../../src/tools/crossword/generate';
import fixture from './fixtures/crossword-upstream.json';

interface Case {
  text: string;
  target: number;
  freq: number;
  len: number;
  seed: number;
  pool: string[];
  width: number;
  height: number;
  rows: string[];
  numbers: number[][];
  placed: { answer: string; hint: string; x: number; y: number; dir: string; num: number }[];
  numberingBug: boolean;
}

const F = fixture as unknown as {
  texts: Record<string, string>;
  extracted: Record<string, [string, number, string[]][]>;
  cases: Case[];
  masks: { hint: string; answer: string; question: string; answer_: string }[];
};

/** 與 upstream.mjs 相同的 mulberry32 */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const compact = (list: Candidate[]) => list.map((w) => [w.answer, w.count, w.sentences]);

describe('候選單字（原作的處理）', () => {
  for (const [name, text] of Object.entries(F.texts)) {
    it(`${name}：${F.extracted[name].length} 個，次數、句子、順序相同`, () => {
      expect(compact(extractWords(text, { extended: false }))).toEqual(F.extracted[name]);
    });
  }

  it('沒有中文、全形冒號與句讀、中文括號、HTML 實體的文字，新版的擴充不影響結果', () => {
    for (const name of ['koLog', 'enStory', 'json', 'htmlLog'])
      expect(compact(extractWords(F.texts[name]))).toEqual(F.extracted[name]);
  });

  it('代表提示是句子清單的第一句', () => {
    for (const w of extractWords(F.texts.koLog)) expect(w.hint).toBe(w.sentences[0]);
  });
});

describe('候選池與盤面（同樣的亂數）', () => {
  for (const c of F.cases) {
    it(`${c.text}／目標 ${c.target}／比重 ${c.freq}、${c.len}／種子 ${c.seed}：${c.placed.length} 個詞`, () => {
      const words = extractWords(F.texts[c.text], { extended: false });
      const opts = { target: c.target, freqWeight: c.freq, lenWeight: c.len };
      expect(weightedPool(words, opts, mulberry32(c.seed)).map((w) => w.answer)).toEqual(c.pool);

      const { puzzle } = buildFromCandidates(words, opts, mulberry32(c.seed));
      expect(puzzle).not.toBeNull();
      if (!puzzle) return;
      expect([puzzle.width, puzzle.height]).toEqual([c.width, c.height]);
      expect(
        puzzle.words.map(({ answer, hint, x, y, dir }) => ({ answer, hint, x, y, dir })),
      ).toEqual(c.placed.map(({ answer, hint, x, y, dir }) => ({ answer, hint, x, y, dir })));
      const cells = puzzleCells(puzzle);
      expect(cells.map((row) => row.map((cell) => cell?.char ?? '.').join(''))).toEqual(c.rows);

      if (!c.numberingBug) {
        expect(puzzle.words.map((w) => w.num)).toEqual(c.placed.map((w) => w.num));
        expect(cells.map((row) => row.map((cell) => cell?.num ?? 0))).toEqual(c.numbers);
        return;
      }
      /* 原作有編號錯誤：同一個號碼用在不同的格子。新版：號碼只跟著起點走 */
      const starts = new Map<number, string>();
      for (const w of puzzle.words) {
        const at = `${w.x},${w.y}`;
        if (starts.has(w.num)) expect(starts.get(w.num)).toBe(at);
        starts.set(w.num, at);
      }
      const byStart = new Map<string, number>();
      for (const w of puzzle.words) {
        const at = `${w.x},${w.y}`;
        if (byStart.has(at)) expect(byStart.get(at)).toBe(w.num);
        byStart.set(at, w.num);
      }
      /* 號碼依擺放順序從 1 起連續 */
      expect(Math.max(...puzzle.words.map((w) => w.num))).toBe(byStart.size);
    });
  }
});

describe('提示的遮蔽', () => {
  /** 原作的 HTML（<strong>…</strong>）換成 hintRuns 的寫法比對 */
  const fromHtml = (html: string) =>
    html
      .split(/(<strong[^>]*>.*?<\/strong>)/)
      .filter(Boolean)
      .map((part) => {
        const m = part.match(/^<strong[^>]*>(.*)<\/strong>$/);
        return m ? { text: m[1], answer: true } : { text: part, answer: false };
      });
  for (const m of F.masks) {
    it(`「${m.answer}」：題目蓋成 ○、解答標出答案`, () => {
      expect(hintRuns(m.hint, m.answer, false)).toEqual(fromHtml(m.question));
      expect(hintRuns(m.hint, m.answer, true)).toEqual(fromHtml(m.answer_));
    });
  }
});
