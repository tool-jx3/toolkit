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
    /* 區域夾在畫面裡 */
    expect(sc.region).toEqual({ x: 0.9, y: 0.1, width: 0.09999999999999998, height: 0.2 });
    expect(n.overrides).toEqual({ k: { text: '改', reroll: 2 } });
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
