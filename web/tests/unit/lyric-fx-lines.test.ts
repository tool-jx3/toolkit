/** 歌詞 → 要排的句（lyric-fx 規格 3.2、F05～F09、F10）與 core/lyrics 的 pairSameTimeLines */
import { describe, expect, it } from 'vitest';
import {
  buildLyricLines,
  DEFAULT_FILTERS,
  keywordList,
  lineKeys,
  matchesKeyword,
  normalizeForMatch,
} from '@/core/lyricfx';
import { pairSameTimeLines, parseLyrics } from '@/core/lyrics';

describe('pairSameTimeLines', () => {
  it('同一時間的兩行＝原文＋翻譯；結束取較晚的', () => {
    const { lines } = parseLyrics('[00:01.00]你好\n[00:01.00]Hello\n[00:03.00]再見\n[00:05.00]');
    const p = pairSameTimeLines(lines);
    expect(p.map((l) => [l.t, l.text, l.tr])).toEqual([
      [1, '你好', 'Hello'],
      [3, '再見', ''],
      [5, '', ''],
    ]);
    expect(p[0].end).toBe(3);
  });
  it('三行同時間：前兩行合併、第三行照舊；空白的不合併；已有翻譯的不合併', () => {
    const { lines } = parseLyrics(
      '[00:01]a\n[00:01]b\n[00:01]c\n[00:02]x\n[00:02]\n[00:03]y\n[-]Y\n[00:03]z',
    );
    const p = pairSameTimeLines(lines);
    expect(p.map((l) => [l.text, l.tr])).toEqual([
      ['a', 'b'],
      ['c', ''],
      ['x', ''],
      ['', ''],
      ['y', 'Y'],
      ['z', ''],
    ]);
  });
  it('不改原本的陣列', () => {
    const { lines } = parseLyrics('[00:01]a\n[00:01]b');
    pairSameTimeLines(lines);
    expect(lines.map((l) => l.text)).toEqual(['a', 'b']);
  });
});

describe('關鍵字比對', () => {
  it('NFKC、轉小寫、拿掉空白', () => {
    expect(normalizeForMatch('Produced  BY：某人')).toBe('producedby:某人');
    expect(keywordList('作詞\n\n  曲： \nOff Vocal')).toEqual(['作詞', '曲:', 'offvocal']);
    expect(matchesKeyword('作曲：某人', keywordList('曲:'))).toBe(true);
    expect(matchesKeyword('一般的歌詞', keywordList(DEFAULT_FILTERS.creditWords))).toBe(false);
    expect(matchesKeyword('纯音乐，请欣赏', keywordList(DEFAULT_FILTERS.instWords))).toBe(true);
    expect(matchesKeyword('Song (Inst.)', keywordList(DEFAULT_FILTERS.instWords))).toBe(true);
    expect(matchesKeyword('instead of', keywordList(DEFAULT_FILTERS.instWords))).toBe(false);
  });
});

describe('buildLyricLines', () => {
  const LRC = [
    '[ti:測試]',
    '[00:00.50]作詞：某人',
    '[00:01.00]第一句',
    '[00:01.00]First line',
    '[00:04.00]第二句',
    '[00:06.00]',
    '[00:08.00]第三句',
    '沒有時間的行',
  ].join('\n');

  it('過濾、同時間的翻譯、結束時間（空白的時間標籤）', () => {
    const b = buildLyricLines(LRC);
    expect(b.lines.map((l) => [l.t, l.end, l.text, l.tr])).toEqual([
      [1, 4, '第一句', ''],
      [4, 6, '第二句', ''],
      [8, Number.POSITIVE_INFINITY, '第三句', ''],
    ]);
    expect(b.rows.map((r) => [r.text, r.tr, r.skipped])).toEqual([
      ['作詞：某人', '', 'credit'],
      ['第一句', 'First line', null],
      ['第二句', '', null],
      ['第三句', '', null],
    ]);
    expect(b.untimedRows).toBe(1);
    expect(b.untimed).toBe(false);
  });

  it('語言：翻譯、原文＋翻譯', () => {
    expect(
      buildLyricLines(LRC, { language: 'translation' }).lines.map((l) => [l.text, l.tr]),
    ).toEqual([
      ['First line', ''],
      ['第二句', ''],
      ['第三句', ''],
    ]);
    expect(buildLyricLines(LRC, { language: 'both' }).lines[0]).toMatchObject({
      text: '第一句',
      tr: 'First line',
    });
  });

  it('關掉過濾時資訊行照樣排（不會讓前一句提早結束）', () => {
    const b = buildLyricLines(LRC, { filters: { ...DEFAULT_FILTERS, credits: false } });
    expect(b.lines[0]).toMatchObject({ t: 0.5, end: 1, text: '作詞：某人' });
  });

  it('演出延遲加在開始與結束', () => {
    const b = buildLyricLines(LRC, { offset: 1.5 });
    expect(b.lines.map((l) => [l.t, l.end])).toEqual([
      [2.5, 5.5],
      [5.5, 7.5],
      [9.5, Number.POSITIVE_INFINITY],
    ]);
  });

  it('逐句覆寫：文字、時間、重抽、鎖定；改時間會重新排序', () => {
    const keys = buildLyricLines(LRC).rows.map((r) => r.key);
    expect(keys[1]).toBe('1000:第一句');
    const b = buildLyricLines(LRC, {
      overrides: {
        '1000:第一句': { text: '改過的第一句', t: 9, reroll: 2, lock: { x: 1 } },
      },
    });
    expect(b.lines.map((l) => l.text)).toEqual(['第二句', '第三句', '改過的第一句']);
    expect(b.lines[2]).toMatchObject({
      t: 9,
      reroll: 2,
      lock: { x: 1 },
      end: Number.POSITIVE_INFINITY,
    });
    expect(b.lines[1].end).toBe(9);
    expect(b.rows.find((r) => r.key === '1000:第一句')?.edited).toBe(true);
  });

  it('同樣的時間與文字第二次起加 #2', () => {
    expect(
      lineKeys([
        { t: 1, text: 'a' },
        { t: 1, text: 'a' },
        { t: 2, text: 'a' },
      ]),
    ).toEqual(['1000:a', '1000:a#2', '2000:a']);
  });

  it('SRT 的結束時間', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\n甲\n\n2\n00:00:05,000 --> 00:00:09,500\n乙\n';
    expect(buildLyricLines(srt).lines.map((l) => [l.t, l.end])).toEqual([
      [1, 2],
      [5, 9.5],
    ]);
  });

  it('沒有時間標記：整段當一句（t＝0、以換行連接）', () => {
    const b = buildLyricLines('  第一行 \n\n第二行\n');
    expect(b.untimed).toBe(true);
    expect(b.lines).toHaveLength(1);
    expect(b.lines[0]).toMatchObject({
      t: 0,
      text: '第一行\n第二行',
      untimed: true,
      key: 'untimed',
    });
    expect(buildLyricLines('   ').lines).toEqual([]);
  });

  it('句數上限', () => {
    const many = Array.from(
      { length: 30 },
      (_, i) => `[00:${String(i).padStart(2, '0')}.00]第${i}句`,
    ).join('\n');
    const b = buildLyricLines(many, { maxLines: 10 });
    expect(b.lines).toHaveLength(10);
    expect(b.truncated).toBe(true);
  });
});
