/**
 * core/lyrics：LRC、SRT、WebVTT 的解析、目前這一行的查找、打點（music-frame 規格 3.4）。
 */
import { describe, expect, it } from 'vitest';
import {
  formatLrcTag,
  hasTranslation,
  isLyricFileName,
  lyricAt,
  lyricIndexAt,
  lyricStats,
  parseLyrics,
  stampLyrics,
} from '@/core/lyrics';

describe('parseLyrics：LRC', () => {
  it('時間標籤（分:秒、百分秒、千分秒、冒號小數）、排序、結束時間＝下一句', () => {
    const r = parseLyrics('[00:10.5]第二句\n[00:05.28]第一句\n[1:02:3]第三句\n[00:20.125]第四句');
    expect(r.kind).toBe('lrc');
    expect(r.lines.map((l) => [l.t, l.text])).toEqual([
      [5.28, '第一句'],
      [10.5, '第二句'],
      [20.125, '第四句'],
      [62.3, '第三句'],
    ]);
    expect(r.lines.map((l) => l.end)).toEqual([10.5, 20.125, 62.3, Number.POSITIVE_INFINITY]);
    expect(r.untimed).toBe(0);
  });

  it('一行多個時間標籤：同一句放在每個時間；翻譯行加在同一組的每一句', () => {
    const r = parseLyrics('[00:01.00][00:30.00] 副歌\n[-] chorus\n[-] again');
    expect(r.lines.map((l) => [l.t, l.text, l.tr])).toEqual([
      [1, '副歌', 'chorus again'],
      [30, '副歌', 'chorus again'],
    ]);
    expect(hasTranslation(r.lines)).toBe(true);
  });

  it('翻譯行前面也可以有時間標籤；沒有上一句時忽略；沒有時間的行打斷翻譯的歸屬', () => {
    const r = parseLyrics('[-] 孤兒\n[00:02.00] 甲\n[00:02.00] [-] A\n沒有時間\n[-] 不算');
    expect(r.lines).toEqual([{ t: 2, end: Number.POSITIVE_INFINITY, text: '甲', tr: 'A' }]);
    expect(r.untimed).toBe(1);
  });

  it('標頭略過、[offset] 讓之後的時間提早（毫秒）、不會小於 0、逐字時間去掉', () => {
    const r = parseLyrics(
      '[ar:某人]\n[ti:歌名]\n[offset:+500]\n[00:00.30]開頭\n[00:03.00]<00:03.00>逐<00:03.50>字\n[offset:-1000]\n[00:04.00]延後',
    );
    expect(r.lines.map((l) => [l.t, l.text])).toEqual([
      [0, '開頭'],
      [2.5, '逐字'],
      [5, '延後'],
    ]);
  });

  it('內容空白的時間標籤保留（清掉畫面上的歌詞）；純文字全部算沒有時間', () => {
    const r = parseLyrics('[00:01]甲\n[00:03]\n[00:05]乙');
    expect(r.lines.map((l) => l.text)).toEqual(['甲', '', '乙']);
    const plain = parseLyrics('第一行\n\n第二行\r\n第三行');
    expect(plain.lines).toEqual([]);
    expect(plain.untimed).toBe(3);
    expect(lyricStats(plain)).toEqual({ lines: 0, translated: 0, untimed: 3 });
  });
});

describe('parseLyrics：SRT／WebVTT', () => {
  it('SRT：時:分:秒,毫秒；多行合併；標籤去掉；翻譯行；依開始排序', () => {
    const srt = [
      '2',
      '00:00:05,500 --> 00:00:07,000',
      '<i>第二段</i>',
      '',
      '1',
      '00:00:01,000 --> 00:00:04,250',
      '第一段',
      '續行',
      '[-] first',
      '',
    ].join('\r\n');
    const r = parseLyrics(srt);
    expect(r.kind).toBe('srt');
    expect(r.lines).toEqual([
      { t: 1, end: 4.25, text: '第一段 續行', tr: 'first' },
      { t: 5.5, end: 7, text: '第二段', tr: '' },
    ]);
  });

  it('WebVTT：標頭、提示的代號、分:秒.毫秒、提示設定、<v> 標籤', () => {
    const vtt = [
      'WEBVTT',
      '',
      'intro',
      '00:01.5 --> 00:03.000 align:start position:10%',
      '<v 吟遊詩人>序曲',
      '',
      '01:00:00.000 --> 01:00:02.000',
      '一小時後',
    ].join('\n');
    const r = parseLyrics(vtt);
    expect(r.lines).toEqual([
      { t: 1.5, end: 3, text: '序曲', tr: '' },
      { t: 3600, end: 3602, text: '一小時後', tr: '' },
    ]);
  });
});

describe('lyricAt', () => {
  const { lines } = parseLyrics('[00:10]甲\n[00:12]\n[00:20]乙\n[00:21]丙');
  it('目前這一句：開始 ≤ t、還沒結束、不是空白', () => {
    expect(lyricIndexAt(lines, 9.99)).toBe(-1);
    expect(lyricAt(lines, 10).current?.text).toBe('甲');
    expect(lyricAt(lines, 11.99).current?.text).toBe('甲');
    expect(lyricAt(lines, 12).current).toBeNull();
    expect(lyricAt(lines, 25).current?.text).toBe('丙');
  });
  it('下一句：跳過空白；沒有目前的句子時只預告 4 秒內的', () => {
    expect(lyricAt(lines, 10).next?.text).toBe('乙');
    expect(lyricAt(lines, 15).next).toBeNull();
    expect(lyricAt(lines, 16).next?.text).toBe('乙');
    expect(lyricAt(lines, 5).next).toBeNull();
    expect(lyricAt(lines, 6).next?.text).toBe('甲');
    expect(lyricAt(lines, 30).next).toBeNull();
  });
  it('SRT 的句子在結束時間後消失', () => {
    const srt = parseLyrics('00:00:01,000 --> 00:00:02,000\nA\n\n00:00:05,000 --> 00:00:06,000\nB');
    expect(lyricAt(srt.lines, 1.5).current?.text).toBe('A');
    expect(lyricAt(srt.lines, 2.5).current).toBeNull();
    expect(lyricAt(srt.lines, 2.5).next?.text).toBe('B');
  });
});

describe('formatLrcTag', () => {
  it('[mm:ss.xx]，百分秒四捨五入（不會出現 60 秒）', () => {
    expect(formatLrcTag(0)).toBe('[00:00.00]');
    expect(formatLrcTag(5.284)).toBe('[00:05.28]');
    expect(formatLrcTag(59.996)).toBe('[01:00.00]');
    expect(formatLrcTag(754.5)).toBe('[12:34.50]');
    expect(formatLrcTag(-3)).toBe('[00:00.00]');
  });
});

describe('stampLyrics', () => {
  it('游標所在的行換上時間，游標移到下一行；跳過空白行與標頭', () => {
    const text = '[ar:某人]\n\n第一行\n第二行';
    const r = stampLyrics(text, 0, 3.5);
    expect(r).toEqual({
      ok: true,
      text: '[ar:某人]\n\n[00:03.50] 第一行\n第二行',
      caret: 24,
      row: 2,
    });
    if (!r.ok) return;
    const r2 = stampLyrics(r.text, r.caret, 7);
    /* 最後一行：尾端補換行、游標在最後，再按一次就是 done */
    expect(r2.ok && r2.text).toBe('[ar:某人]\n\n[00:03.50] 第一行\n[00:07.00] 第二行\n');
    if (!r2.ok) return;
    expect(r2.caret).toBe(r2.text.length);
    expect(stampLyrics(r2.text, r2.caret, 9)).toEqual({ ok: false, reason: 'done' });
  });
  it('已有時間的行換掉時間；下面的翻譯行換上同樣的時間', () => {
    const text = '[00:01.00] 甲\n[00:01.00] [-] A\n乙';
    const r = stampLyrics(text, 3, 9.1);
    expect(r.ok && r.text).toBe('[00:09.10] 甲\n[00:09.10] [-] A\n乙');
    expect(r.ok && r.caret).toBe(text.indexOf('乙'));
  });
  it('到底了從頭找第一個還沒有時間的行；全部都有時間時 done；空白時 empty', () => {
    const text = '[00:01.00] 甲\n乙\n';
    const r = stampLyrics(text, text.length, 2);
    expect(r.ok && r.text).toBe('[00:01.00] 甲\n[00:02.00] 乙\n');
    expect(stampLyrics('[00:01.00] 甲\n', 13, 3)).toEqual({ ok: false, reason: 'done' });
    expect(stampLyrics('  \n ', 0, 1)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('isLyricFileName', () => {
  it('.lrc／.srt／.vtt（不分大小寫）', () => {
    expect(['a.lrc', 'b.SRT', 'c.vtt', 'd.txt', 'e.mp3'].map(isLyricFileName)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
