/**
 * 文字記錄（F76～F85、規格 3.2、3.7）：字型與排版數值、自動分頁（推到下一頁同一欄、需要時加頁並沿用設定、
 * 只往後推、接續的段落、30 頁上限保留在原頁）、新增與刪除頁面、看全部的大小與位置。
 * 量字寬用固定的假字寬（每字 22 px），不依賴字型。
 */
import { describe, expect, it } from 'vitest';
import { docText, plainDoc } from '@/core/richtext';
import type { Draft } from '@/tools/pair-maker/model';
import {
  type Advance,
  addPage,
  bodyNode,
  fid,
  LOG_VARIANTS,
  logDuo,
  logPlain,
  logSize,
  logStyle,
  MAX_PAGES,
  pageOffset,
  pagesOf,
  paginate,
  removePage,
} from '@/tools/pair-maker/templates/textlog';

const fixed: Advance = () => () => 22;
const V = LOG_VARIANTS.plain;
/** 素面的本文欄：寬 560、高 774；明體 22 px、行高 1.5 → 每行 33 px、放得下 23 行；壓縮 0.95 時一行約 26 字（含縮排的第一行少一點） */
const body = (d: Draft, n: number, lane = 0) => docText(d.v[fid(n, lane, 'body')] as never);

function withBody(text: string, d: Draft = logPlain.initial()): Draft {
  return { ...d, v: { ...d.v, [fid(1, 0, 'body')]: plainDoc(text, '#323232') } };
}

describe('字型與排版的數值（規格 3.7）', () => {
  it('明體／黑體的字重、字級、行高、字距、壓縮', () => {
    expect(logStyle(true, 'title')).toMatchObject({
      font: { weight: 600, size: 32 },
      lineHeight: 1.3,
      letterSpacing: -2.5,
      spaceScale: 2,
      scaleX: 0.95,
    });
    expect(logStyle(true, 'body')).toMatchObject({
      font: { weight: 500, size: 22 },
      lineHeight: 1.5,
    });
    expect(logStyle(false, 'title')).toMatchObject({
      font: { weight: 700 },
      letterSpacing: -0.5,
      spaceScale: 1,
    });
    expect(logStyle(false, 'body')).toMatchObject({ font: { weight: 400 }, lineHeight: 1.3 });
    expect(logStyle(false, 'sub')).toMatchObject({ font: { weight: 400, size: 20 } });
  });

  it('本文的預設：置中、首行縮排 30', () => {
    const n = bodyNode(V, logPlain.initial(), 1, 0);
    expect(n).toMatchObject({ valign: 'middle', indent: 30, continued: false, scaleX: 0.95 });
  });
});

describe('自動分頁（F80）', () => {
  it('放得下時不變', () => {
    const d = withBody('短短一段');
    const r = paginate(d, V, fixed);
    expect(r.changed).toBe(false);
    expect(r.draft).toBe(d);
  });

  it('放不下：多的部分推到下一頁同一欄（需要時加頁，沿用標題、副標題與設定），接續的段落記下來', () => {
    let d = withBody('甲'.repeat(2000));
    d = {
      ...d,
      v: {
        ...d.v,
        [fid(1, 0, 'indent')]: 10,
        [fid(1, 0, 'align')]: 'top',
        [fid(1, 0, 'title')]: plainDoc('自訂標題'),
      },
    };
    const r = paginate(d, V, fixed);
    expect(r.changed).toBe(true);
    expect(r.capped).toBe(false);
    const pages = pagesOf(r.draft);
    expect(pages.length).toBeGreaterThan(2);
    const total = pages.map((n) => body(r.draft, n)).join('');
    expect(total).toBe('甲'.repeat(2000));
    const n2 = pages[1];
    expect(r.draft.v[fid(n2, 0, 'indent')]).toBe(10);
    expect(r.draft.v[fid(n2, 0, 'align')]).toBe('top');
    expect(docText(r.draft.v[fid(n2, 0, 'title')] as never)).toBe('自訂標題');
    expect(r.draft.cont?.[fid(n2, 0, 'body')]).toBe(true);
    /* 每頁的行數不超過放得下的行數（23 行） */
    for (const n of pages.slice(0, -1))
      expect(body(r.draft, n).length).toBeLessThanOrEqual(23 * 27);
    /* 再分一次：不變 */
    expect(paginate(r.draft, V, fixed).changed).toBe(false);
  });

  it('推到下一頁時接在那一頁本文的最前面；只往後推、不會把字拉回來', () => {
    let d = addPage(withBody('甲'.repeat(800)), V) ?? logPlain.initial();
    d = { ...d, v: { ...d.v, [fid(2, 0, 'body')]: plainDoc('乙乙乙') } };
    const r = paginate(d, V, fixed);
    expect(body(r.draft, 2).endsWith('乙乙乙')).toBe(true);
    expect(body(r.draft, 2).startsWith('甲')).toBe(true);
    /* 把第一頁刪短：第二頁的字不會回來 */
    const shorter = { ...r.draft, v: { ...r.draft.v, [fid(1, 0, 'body')]: plainDoc('丙') } };
    const again = paginate(shorter, V, fixed);
    expect(again.changed).toBe(false);
    expect(body(again.draft, 1)).toBe('丙');
  });

  it('切在段落的開頭：下一頁不是接續', () => {
    /* 第一行縮排 30：(25 × 22 ＋ 30) × 0.95 ≤ 560 → 25 字；其餘每行 26 字；23 行剛好放 25 ＋ 26 × 22 ＝ 597 字 */
    const text = `${'甲'.repeat(597)}\n乙`;
    const r = paginate(withBody(text), V, fixed);
    const n2 = pagesOf(r.draft)[1];
    /* 換行留在原頁的最後（與舊版相同） */
    expect(body(r.draft, 1)).toBe(`${'甲'.repeat(597)}\n`);
    expect(body(r.draft, n2)).toBe('乙');
    expect(r.draft.cont?.[fid(n2, 0, 'body')]).toBeUndefined();
  });

  it('30 頁上限：放不下的字保留在原頁並回報 capped', () => {
    let d = logPlain.initial();
    while (pagesOf(d).length < MAX_PAGES) d = addPage(d, V) ?? d;
    const last = pagesOf(d)[MAX_PAGES - 1];
    d = { ...d, v: { ...d.v, [fid(last, 0, 'body')]: plainDoc('甲'.repeat(3000)) } };
    const r = paginate(d, V, fixed);
    expect(r.capped).toBe(true);
    expect(pagesOf(r.draft).length).toBe(MAX_PAGES);
    expect(body(r.draft, last).length).toBe(3000);
  });

  it('雙欄配對：兩欄各自推到下一頁的同一欄', () => {
    const v = LOG_VARIANTS.duo;
    let d = logDuo.initial();
    d = {
      ...d,
      v: {
        ...d.v,
        [fid(1, 0, 'body')]: plainDoc('左'.repeat(800)),
        [fid(1, 1, 'body')]: plainDoc('右'.repeat(800)),
      },
    };
    const r = paginate(d, v, fixed);
    const n2 = pagesOf(r.draft)[1];
    expect(body(r.draft, n2, 0).startsWith('左')).toBe(true);
    expect(body(r.draft, n2, 1).startsWith('右')).toBe(true);
  });
});

describe('頁面（F82～F85、規格 3.2）', () => {
  it('新增：加在最後並切過去、本文空白；30 頁時不行', () => {
    const d = addPage(logPlain.initial(), V);
    expect(d?.pages).toEqual([1, 2]);
    expect(d?.active).toBe(2);
    expect(body(d ?? logPlain.initial(), 2)).toBe('');
    let full = logPlain.initial();
    while (pagesOf(full).length < MAX_PAGES) full = addPage(full, V) ?? full;
    expect(addPage(full, V)).toBeNull();
  });

  it('刪除：連同那一頁的文字與貼紙，切到原位置的下一頁（沒有就上一頁）；只剩一頁時不行', () => {
    let d = addPage(addPage(logPlain.initial(), V) ?? logPlain.initial(), V) ?? logPlain.initial();
    d = {
      ...d,
      stickers: [
        {
          id: 'a',
          asset: 'x',
          name: '',
          cx: 1,
          cy: 1,
          width: 10,
          height: 10,
          rotation: 0,
          shadow: false,
          outline: false,
          cite: '',
          page: 2,
        },
        {
          id: 'b',
          asset: 'x',
          name: '',
          cx: 1,
          cy: 1,
          width: 10,
          height: 10,
          rotation: 0,
          shadow: false,
          outline: false,
          cite: '',
          page: 3,
        },
      ],
    };
    const r = removePage(d, 2);
    expect(r?.pages).toEqual([1, 3]);
    expect(r?.active).toBe(3);
    expect(r?.stickers.map((s) => s.id)).toEqual(['b']);
    expect(Object.keys(r?.v ?? {}).some((k) => k.startsWith('p2.'))).toBe(false);
    expect(removePage(r ?? d, 3)?.active).toBe(1);
    expect(removePage(logPlain.initial(), 1)).toBeNull();
  });

  it('看全部：3 欄、頁間 10 px；單獨看是一頁', () => {
    let d = logPlain.initial();
    for (let i = 0; i < 3; i++) d = addPage(d, V) ?? d;
    expect(logSize({ ...d, view: 'single' })).toEqual({ width: 780, height: 1080 });
    expect(logSize({ ...d, view: 'all' })).toEqual({ width: 2360, height: 2170 });
    expect([0, 2, 3, 6].map(pageOffset)).toEqual([
      { x: 0, y: 0 },
      { x: 1580, y: 0 },
      { x: 0, y: 1090 },
      { x: 0, y: 2180 },
    ]);
  });
});
