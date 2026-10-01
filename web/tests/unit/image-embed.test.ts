import { describe, expect, it } from 'vitest';
import {
  dataUriBytes,
  dataUriToBlob,
  formatEmbedBytes,
  isWholeImage,
  normalizeCropRect,
  transparentTrimRect,
} from '@/core/image';
import { parseComposerText } from '@/ui/MessageComposer';
import { applyTestShortcut } from '@/ui/TestValueRow';

const bounds = { width: 300, height: 600 };

describe('數值範圍裁切的修正規則', () => {
  it('四捨五入、負的寬高視為反方向、超出的部分夾掉、不到 1px 視為範圍在圖外', () => {
    expect(normalizeCropRect({ x: 10.4, y: 20.6, width: 100.5, height: 50 }, bounds)).toEqual({
      x: 10,
      y: 21,
      width: 101,
      height: 50,
    });
    expect(normalizeCropRect({ x: 100, y: 100, width: -50, height: -20 }, bounds)).toEqual({
      x: 50,
      y: 80,
      width: 50,
      height: 20,
    });
    expect(normalizeCropRect({ x: 0, y: 0, width: 5000, height: 10 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 10,
    });
    expect(normalizeCropRect({ x: 9999, y: 0, width: 10, height: 10 }, bounds)).toBeNull();
    expect(normalizeCropRect({ x: -20, y: 0, width: 10, height: 10 }, bounds)).toBeNull();
    expect(normalizeCropRect({ x: 0, y: 0, width: 0.4, height: 10 }, bounds)).toBeNull();
    expect(normalizeCropRect({ x: Number.NaN, y: 0, width: 1, height: 1 }, bounds)).toBeNull();
    expect(isWholeImage({ x: 0, y: 0, width: 300, height: 600 }, bounds)).toBe(true);
  });
});

describe('修掉透明留白', () => {
  function pixels(w: number, h: number, opaque: (x: number, y: number) => boolean) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = opaque(x, y) ? 1 : 0;
    return { data, width: w, height: h };
  }

  it('不透明度 > 0 的外接矩形；整張不透明或全透明時沒有可修的留白', () => {
    expect(
      transparentTrimRect(pixels(30, 60, (x, y) => x >= 7 && x <= 22 && y >= 4 && y <= 55)),
    ).toEqual({ x: 7, y: 4, width: 16, height: 52 });
    expect(transparentTrimRect(pixels(10, 10, () => true))).toBeNull();
    expect(transparentTrimRect(pixels(10, 10, () => false))).toBeNull();
  });
});

describe('data URI', () => {
  it('解碼後的位元組數與大小顯示', async () => {
    expect(dataUriBytes('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUriBytes('data:image/png;base64,AAA=')).toBe(2);
    expect(dataUriBytes('data:text/plain,%E4%BD%A0')).toBe(3);
    const blob = dataUriToBlob('data:image/png;base64,AAAA');
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(3);
    expect(formatEmbedBytes(900)).toBe('900 B');
    expect(formatEmbedBytes(9318)).toBe('9.1 KB');
    expect(formatEmbedBytes(3 * 1024 * 1024 + 50000)).toBe('3.05 MB');
  });
});

describe('測試訊息與測試數值', () => {
  it('以第一個「|」分開指令與結果（全形也可以）', () => {
    expect(parseComposerText('CC<=50 | (1D100<=50) ＞ 23 ＞ 成功')).toEqual({
      command: 'CC<=50',
      result: '(1D100<=50) ＞ 23 ＞ 成功',
    });
    expect(parseComposerText('2D6｜(2D6) ＞ 7')).toEqual({ command: '2D6', result: '(2D6) ＞ 7' });
    expect(parseComposerText('你好')).toEqual({ command: '你好', result: null });
    expect(parseComposerText('擲骰 | ')).toEqual({ command: '擲骰', result: null });
  });

  it('快捷鈕：−3／＋3／減半／危急／歸零／全部回復', () => {
    expect(applyTestShortcut('minus', 2, 12)).toBe(0);
    expect(applyTestShortcut('plus', 11, 12)).toBe(12);
    expect(applyTestShortcut('half', 5, 13)).toBe(7);
    expect(applyTestShortcut('critical', 12, 12, { threshold: 25 })).toBe(2);
    expect(applyTestShortcut('critical', 12, 14, { threshold: 25 })).toBe(3);
    expect(applyTestShortcut('critical', 1, 1, { threshold: 5 })).toBe(0);
    expect(applyTestShortcut('zero', 5, 12)).toBe(0);
    expect(applyTestShortcut('full', 5, 12)).toBe(12);
  });
});
