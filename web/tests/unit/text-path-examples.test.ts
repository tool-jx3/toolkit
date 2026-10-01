/**
 * 文字軌跡產生器：規格附件 docs/refactor/specs/text-path.examples.json 的 29 組逐字比對（繪製區 634 × 300）。
 * - 軌跡 null＝預設形狀（依繪製區大小產生）；自由繪製直接用附件的折線。
 * - 「反轉」先起訖對調；「自動調整」先依字數縮放（間距倍數），再產生。
 * - 輸出與結果字數都要逐字相同（附件全是基本平面的字，碼位數＝UTF-16 長度）。
 */
import { describe, expect, it } from 'vitest';
import { type Point, pathBounds, pathLength, reversePath } from '@/core/path';
import {
  FILL_CHARS,
  type FillKind,
  fitPathToText,
  generate,
  PAD_HEIGHT,
  PAD_WIDTH,
  type PresetShapeId,
  resultCount,
  shapePath,
  splitChars,
} from '@/tools/text-path/logic';
import examples from '../../../docs/refactor/specs/text-path.examples.json';

interface Example {
  編號: string;
  形狀: '圓' | '螺旋' | '愛心' | '自由繪製';
  軌跡: [number, number][] | null;
  文字: string;
  格線大小: number;
  空白字元: 'U+3000' | 'U+0020' | 'U+318D';
  行首替換: boolean;
  反轉: boolean;
  自動調整?: {
    間距倍數: number;
    調整後總長: number;
    調整後外接框: [number, number, number, number];
  };
  輸出: string;
  結果字數: number;
}

const doc = examples as unknown as { 繪製區: [number, number]; 範例: Example[] };

const SHAPE: Record<Exclude<Example['形狀'], '自由繪製'>, PresetShapeId> = {
  圓: 'circle',
  螺旋: 'spiral',
  愛心: 'heart',
};
const FILL: Record<Example['空白字元'], FillKind> = {
  'U+3000': 'ideographic',
  'U+0020': 'space',
  'U+318D': 'middot',
};

function basePath(e: Example): Point[] {
  if (e.軌跡) return e.軌跡.map(([x, y]) => ({ x, y }));
  if (e.形狀 === '自由繪製') throw new Error(`${e.編號}：自由繪製卻沒有軌跡`);
  return shapePath(SHAPE[e.形狀]);
}

function run(e: Example) {
  let path = basePath(e);
  if (e.反轉) path = reversePath(path);
  if (e.自動調整) {
    const fit = fitPathToText({
      path,
      count: splitChars(e.文字).length,
      cols: e.格線大小,
      spacing: e.自動調整.間距倍數,
    });
    if (!fit.ok) throw new Error(`${e.編號}：縮放失敗 ${fit.reason}`);
    path = fit.path;
  }
  const r = generate({
    text: e.文字,
    path,
    cols: e.格線大小,
    fill: FILL_CHARS[FILL[e.空白字元]],
    lineHead: e.行首替換,
  });
  if (!r.ok) throw new Error(`${e.編號}：產生失敗 ${r.reason}`);
  return { text: r.text, path };
}

describe('text-path：附件 29 組逐字相符', () => {
  it('附件的繪製區與新版的邏輯尺寸相同（634 × 300）', () => {
    expect(doc.繪製區).toEqual([PAD_WIDTH, PAD_HEIGHT]);
    expect(doc.範例).toHaveLength(29);
  });

  it.each(doc.範例.map((e) => [e.編號, e] as const))('%s', (_id, e) => {
    const { text, path } = run(e);
    expect(text).toBe(e.輸出);
    expect(resultCount(text)).toBe(e.結果字數);
    expect(text.length).toBe(e.結果字數);
    expect(text.endsWith('\n')).toBe(false);
    if (e.自動調整) {
      /* 規格 3.5 的量測（附件四捨五入到一位小數） */
      expect(pathLength(path)).toBeCloseTo(e.自動調整.調整後總長, 0);
      const b = pathBounds(path);
      const [x0, y0, x1, y1] = e.自動調整.調整後外接框;
      expect(b.x).toBeCloseTo(x0, 0);
      expect(b.y).toBeCloseTo(y0, 0);
      expect(b.x + b.w).toBeCloseTo(x1, 0);
      expect(b.y + b.h).toBeCloseTo(y1, 0);
    }
  });
});
