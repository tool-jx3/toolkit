/**
 * 社群貼文產生器的文字規則（規格 F32、F33、3.4）：#標籤／@提及的判斷、「更多」折疊、省略、多段字型的換行。
 */
import { describe, expect, it } from 'vitest';
import {
  BADGE,
  collapseCaption,
  ellipsize,
  type FontSpec,
  layoutLines,
  linkTokens,
  type Measure,
} from '../../src/tools/social-post/text';

/** 假的量字：中日韓與 emoji 一個字＝字級，其他半個字級；粗體多 10% */
const measure: Measure = (text, font) =>
  Array.from(text).reduce(
    (w, ch) =>
      w +
      (/[⺀-￿]|\p{Extended_Pictographic}/u.test(ch) ? 1 : 0.5) *
        font.size *
        (font.weight >= 600 ? 1.1 : 1),
    0,
  );
const F14: FontSpec = { family: 'Noto Sans TC', weight: 400, size: 14 };
const B14: FontSpec = { ...F14, weight: 600 };

describe('#標籤、@提及（F32）', () => {
  it('前面是開頭、空白或「(」才算；後面接文字、數字、底線、點', () => {
    const t = linkTokens('#霧港鎮 取材 a#b @kai.archive (#夜) 結尾@x_y');
    expect(t.filter((x) => x.link).map((x) => x.text)).toEqual(['#霧港鎮', '@kai.archive', '#夜']);
    expect(t.map((x) => x.text).join('')).toBe('#霧港鎮 取材 a#b @kai.archive (#夜) 結尾@x_y');
  });

  it('換行後的標籤也算', () => {
    const t = linkTokens('第一行\n#第二行');
    expect(t.filter((x) => x.link).map((x) => x.text)).toEqual(['#第二行']);
  });

  it('單獨的 # 不算', () => {
    expect(linkTokens('# 不是標籤').some((x) => x.link)).toBe(false);
  });
});

describe('「更多」折疊（F33）', () => {
  it('只留第一行、最多 38 個字', () => {
    expect(collapseCaption('第一行\n第二行')).toEqual({ text: '第一行', more: true });
    const long = '一'.repeat(50);
    expect(collapseCaption(long)).toEqual({ text: '一'.repeat(38), more: true });
  });

  it('第一行就是全部時不加', () => {
    expect(collapseCaption('只有一行')).toEqual({ text: '只有一行', more: false });
  });

  it('emoji 算一個字', () => {
    const s = `${'📷'.repeat(40)}`;
    expect(Array.from(collapseCaption(s).text)).toHaveLength(38);
  });
});

describe('省略（帳號等單行文字）', () => {
  it('放得下時原樣；放不下時接「…」', () => {
    expect(ellipsize('abcd', 100, F14, measure)).toBe('abcd');
    const out = ellipsize('一二三四五六七八', 60, F14, measure);
    expect(out.endsWith('…')).toBe(true);
    expect(measure(out, F14)).toBeLessThanOrEqual(60);
  });
});

describe('多段字型的換行（3.4）', () => {
  it('粗體帳號＋內文：寬度內換行、每段保留字型與顏色', () => {
    const lines = layoutLines(
      [
        { text: 'xiaoyu.lin', font: B14, color: '#000000' },
        { text: ' 週末到霧港鎮取材，燈塔半夜有人點燈', font: F14, color: '#111111' },
      ],
      120,
      measure,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(120 + 1e-6);
    expect(lines[0].runs[0]).toMatchObject({
      text: 'xiaoyu.lin',
      font: B14,
      color: '#000000',
      x: 0,
    });
    expect(lines.flatMap((l) => l.runs.map((r) => r.text)).join('')).toBe(
      'xiaoyu.lin 週末到霧港鎮取材，燈塔半夜有人點燈',
    );
  });

  it('原文的換行是新的一行；空行也算一行', () => {
    const lines = layoutLines([{ text: 'a\n\nb', font: F14, color: '#000' }], 200, measure);
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['a', '', 'b']);
  });

  it('英數字詞不拆開、句讀不在行首', () => {
    const lines = layoutLines([{ text: 'hello world', font: F14, color: '#000' }], 50, measure);
    expect(
      lines.map((l) =>
        l.runs
          .map((r) => r.text)
          .join('')
          .trim(),
      ),
    ).toEqual(['hello', 'world']);
    const zh = layoutLines([{ text: '一二三四。', font: F14, color: '#000' }], 56, measure);
    expect(
      zh
        .at(-1)
        ?.runs.map((r) => r.text)
        .join(''),
    ).toMatch(/^.。$/);
  });

  it('徽章（BADGE）以指定的寬度排', () => {
    const lines = layoutLines(
      [
        { text: 'ab', font: B14, color: '#000' },
        { text: BADGE, font: B14, color: '#000', advance: 18 },
        { text: ' c', font: F14, color: '#000' },
      ],
      500,
      measure,
    );
    const badge = lines[0].runs.find((r) => r.text === BADGE);
    expect(badge?.width).toBe(18);
    expect(badge?.x).toBeCloseTo(measure('ab', B14));
  });
});
