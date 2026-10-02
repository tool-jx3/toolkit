/**
 * 切字：以碼位（Array.from）或字素（Intl.Segmenter，使用者看到的「一個字」）為單位。
 *
 * 字素：組合字元、旗幟、膚色、ZWJ 組成的表情符號都算一個字（「👨‍👩‍👧」是一個字，不是五個）。
 * 不支援 Intl.Segmenter 的環境退回以碼位切。
 */

export type SplitUnit = 'codepoint' | 'grapheme';

type SegmenterLike = { segment(text: string): Iterable<{ segment: string }> };

let segmenter: SegmenterLike | null | undefined;

function getSegmenter(): SegmenterLike | null {
  if (segmenter === undefined) {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => SegmenterLike })
      .Segmenter;
    segmenter = Seg ? new Seg(undefined, { granularity: 'grapheme' }) : null;
  }
  return segmenter;
}

/** 以字素切字（不支援時以碼位） */
export function splitGraphemes(text: string): string[] {
  const seg = getSegmenter();
  if (!seg) return Array.from(text);
  const out: string[] = [];
  for (const s of seg.segment(text)) out.push(s.segment);
  return out;
}

/** 依單位切字 */
export function splitChars(text: string, unit: SplitUnit = 'codepoint'): string[] {
  return unit === 'grapheme' ? splitGraphemes(text) : Array.from(text);
}

/** 字數（字素），例如字數提示「表情符號算 1 個字」 */
export function countGraphemes(text: string): number {
  return splitGraphemes(text).length;
}
