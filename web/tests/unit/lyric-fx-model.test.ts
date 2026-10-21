/** 歌詞演出產生器的設定（規格 3.10）：正規化、時間的寫法、匯出範圍、檔名 */
import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  exportRange,
  fileBase,
  formatClock,
  formatLyricTime,
  loopLengthFor,
  normalizeSettings,
  parseLyricTime,
  sizeOf,
} from '@/tools/lyric-fx/model';

describe('normalizeSettings', () => {
  it('預設值；壞掉的值改回預設、超出範圍的夾回', () => {
    const d = defaultSettings();
    expect(normalizeSettings(undefined)).toEqual(d);
    const n = normalizeSettings({
      lyrics: { text: 'x', offset: 99, fileName: 3 },
      language: 'klingon',
      styleId: 'nope',
      seed: -5,
      canvas: { size: '999x1' },
      background: { kind: 'image', color: 'red', image: { id: 'abc', name: 'a.png' }, fit: 'zoom' },
      export: { fps: 25, range: 'part', start: 3, end: 9, webmAudio: false },
      styles: {
        scatter: {
          fontSize: 1000,
          mode: 'latin',
          region: { x: 0.9, y: 0.1, width: 0.5, height: 0.2 },
        },
      },
      overrides: { k: { text: '改', t: -1, reroll: 2.7, junk: 1 }, empty: {} },
    });
    expect(n.lyrics).toEqual({ text: 'x', fileName: '', offset: 10 });
    expect(n.language).toBe('original');
    expect(n.styleId).toBe('scatter');
    expect(n.seed).toBe(0);
    expect(n.canvas.size).toBe('1920x1080');
    expect(n.background).toEqual({
      kind: 'image',
      color: '#000000',
      image: { id: 'abc', name: 'a.png' },
      fit: 'cover',
    });
    expect(n.export).toEqual({ fps: 30, range: 'part', start: 3, end: 9, webmAudio: false });
    const sc = n.styles.scatter as Record<string, unknown>;
    expect(sc.fontSize).toBe(133);
    expect(sc.mode).toBe('latin');
    /* 版本 1 的避開區域（在風格的設定裡）搬到工具層，夾在畫面裡 */
    expect(sc.region).toBeUndefined();
    expect(n.region).toEqual({ x: 0.9, y: 0.1, width: 0.09999999999999998, height: 0.2 });
    expect(n.overrides).toEqual({ k: { text: '改', reroll: 2 } });
  });

  it('避開區域是工具層的共用設定（版本 2）：region 優先、太小的當成沒有', () => {
    expect(defaultSettings().region).toBeNull();
    const r = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
    expect(normalizeSettings({ region: r }).region).toEqual(r);
    /* 版本 2 的 region 是 null 時不再看風格裡的舊欄位 */
    expect(normalizeSettings({ region: null, styles: { scatter: { region: r } } }).region).toBeNull();
    expect(normalizeSettings({ region: { x: 0.1, y: 0.1, width: 0.001, height: 0.5 } }).region).toBeNull();
  });

  it('版本 1 的預設關鍵字（沒有改過）換成新的預設；改過的照舊', () => {
    const v1Credit = [
      '作詞', '作词', '作曲', '編曲', '编曲', '製作人', '制作人', '監製', '监制', '原唱', '翻唱', '混音', '錄音',
      '录音', '和聲', '和声', '統籌', '统筹', '企劃', '企划', '出品', '封面', '詞:', '词:', '曲:', '吉他:', '貝斯:',
      '贝斯:', '鼓:', '鍵盤:', '键盘:', '弦樂:', '弦乐:', 'op:', 'sp:', 'program', 'produced by', 'written by',
      'composed by', 'arranged by', 'mixed by', 'mastered by', 'lyrics by', 'music by',
    ].join('\n');
    const v1Inst = [
      '(inst', '[inst', '【inst', 'instrumental', '純音樂', '纯音乐', '伴奏', 'off vocal', 'カラオケ', 'karaoke',
    ].join('\n');
    const d = defaultSettings();
    const n = normalizeSettings({ filters: { credits: true, creditWords: v1Credit, inst: true, instWords: v1Inst } });
    expect(n.filters.creditWords).toBe(d.filters.creditWords);
    expect(n.filters.instWords).toBe(d.filters.instWords);
    const custom = normalizeSettings({ filters: { creditWords: `${v1Credit}\n自己加的`, instWords: 'x' } });
    expect(custom.filters.creditWords).toBe(`${v1Credit}\n自己加的`);
    expect(custom.filters.instWords).toBe('x');
  });
});

describe('時間', () => {
  it('formatLyricTime／parseLyricTime', () => {
    expect(formatLyricTime(0)).toBe('0:00.00');
    expect(formatLyricTime(65.456)).toBe('1:05.46');
    expect(parseLyricTime('1:05.46')).toBeCloseTo(65.46, 6);
    expect(parseLyricTime('１：０５')).toBe(65);
    expect(parseLyricTime('12.5')).toBe(12.5);
    expect(parseLyricTime('1:02:03')).toBe(3723);
    expect(parseLyricTime('1:75')).toBeNaN();
    expect(parseLyricTime('abc')).toBeNaN();
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(65.9)).toBe('1:05');
  });
});

describe('匯出', () => {
  it('範圍：整首、指定區間（不到 1 秒＝null）', () => {
    const s = defaultSettings();
    expect(exportRange(s, 30)).toEqual({ start: 0, end: 30 });
    s.export.range = 'part';
    s.export.start = 10;
    s.export.end = 40;
    expect(exportRange(s, 30)).toEqual({ start: 10, end: 30 });
    s.export.end = 10.5;
    expect(exportRange(s, 30)).toBeNull();
  });
  it('檔名的主要部分：音樂 → 歌詞檔 → lyric-fx', () => {
    const s = defaultSettings();
    expect(fileBase(s)).toBe('lyric-fx');
    s.lyrics.fileName = '夜曲.lrc';
    expect(fileBase(s)).toBe('夜曲');
    s.audio = { id: 'x', name: 'song.final.mp3' };
    expect(fileBase(s)).toBe('song.final');
  });
  it('沒有音樂的長度：最後一句打完再 3 秒、至少 5 秒', () => {
    expect(loopLengthFor(0)).toBe(5);
    expect(loopLengthFor(29.25)).toBe(32.3);
    expect(sizeOf('1080x1920')).toEqual({ width: 1080, height: 1920 });
  });
});
