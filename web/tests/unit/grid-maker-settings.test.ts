/**
 * 網格產生器的設定（規格 grid-maker 第 1、3 節）：兩種形狀各自的預設、讀檔整理、畫布尺寸、檔名。
 */
import { describe, expect, it } from 'vitest';
import {
  canvasSize,
  DEFAULT_HEX,
  DEFAULT_SETTINGS,
  DEFAULT_SQUARE,
  drawableHex,
  drawableSquare,
  fileName,
  looksLikeSettings,
  type Settings,
  sanitizeSettings,
  tooLarge,
} from '../../src/tools/grid-maker/settings';

const square = (patch: Partial<Settings['square']> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  shape: 'square',
  square: { ...DEFAULT_SQUARE, ...patch },
});
const hex = (patch: Partial<Settings['hex']> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  shape: 'hex',
  hex: { ...DEFAULT_HEX, ...patch },
});

describe('預設值（照舊版，兩種形狀不同）', () => {
  it('方格 15 × 15、48 px、座標在中間；六角格 15 × 21、座標在下方', () => {
    expect(DEFAULT_SQUARE).toMatchObject({
      cols: 15,
      rows: 15,
      size: 48,
      lineColor: '#00e5ff',
      lineWidth: 2,
      lineStyle: 'solid',
      glow: false,
      scale: 100,
      cornerRadius: 0,
      showCoords: true,
      coordColor: '#00e5ff',
      coordFormat: 'hyphen',
      coordOrigin: 'tl',
      coordStart: 0,
      coordPos: 'middle',
      coordOffset: 8,
      coordFontSize: 12,
    });
    expect(DEFAULT_HEX).toMatchObject({
      cols: 15,
      rows: 21,
      size: 48,
      orientation: 'flat',
      shift: false,
      outer: false,
      fit: false,
      rowMode: 'compress',
      coordPos: 'bottom',
    });
  });
});

describe('畫布尺寸與檔名', () => {
  it('方格：欄 × 大小、列 × 大小；grid_<欄>x<列>_<大小>px.png', () => {
    expect(canvasSize(square())).toEqual({ width: 720, height: 720 });
    expect(fileName(square())).toBe('grid_15x15_48px.png');
    expect(fileName(square({ cols: 7, rows: 5, size: 60 }))).toBe('grid_7x5_60px.png');
  });

  it('六角格：沒有網格化是 hex.png；網格化是 hex_<CCFOLIA 的欄>x<列>.png', () => {
    expect(canvasSize(hex())).toEqual({ width: 637, height: 528 });
    expect(fileName(hex())).toBe('hex.png');
    expect(canvasSize(hex({ fit: true }))).toEqual({ width: 768, height: 528 });
    expect(fileName(hex({ fit: true }))).toBe('hex_30x22.png');
    expect(fileName(hex({ fit: true, orientation: 'pointy' }))).toBe('hex_16x42.png');
    expect(fileName(hex({ fit: true, cols: 5, rows: 6, size: 77 }))).toBe('hex_10x7.png');
  });

  it('打字中的小數取整數部分（舊版 parseInt），超出範圍夾回', () => {
    expect(
      drawableSquare({ ...DEFAULT_SQUARE, cols: 12.7, size: 600, cornerRadius: -3 }),
    ).toMatchObject({
      cols: 12,
      size: 500,
      cornerRadius: 0,
    });
    expect(drawableHex({ ...DEFAULT_HEX, coordFormat: 'serial', rowMode: 'half' }).rowMode).toBe(
      'compress',
    );
  });

  it('太大的畫布不畫', () => {
    expect(tooLarge(square())).toBe(false);
    expect(tooLarge(square({ cols: 1000, rows: 1000, size: 48 }))).toBe(true);
  });
});

describe('讀檔整理', () => {
  it('缺的補預設、數值夾在範圍內、未知的選項換成預設', () => {
    const s = sanitizeSettings({
      shape: 'hex',
      square: { cols: 5000, lineStyle: 'wavy', coordStart: 7, lineColor: 'red' },
      hex: { orientation: 'pointy', coordFormat: 'serial', rowMode: 'half', scale: 3 },
    });
    expect(s.shape).toBe('hex');
    expect(s.square.cols).toBe(1000);
    expect(s.square.lineStyle).toBe('solid');
    expect(s.square.coordStart).toBe(0);
    expect(s.square.lineColor).toBe('#00e5ff');
    expect(s.hex.orientation).toBe('pointy');
    expect(s.hex.rowMode).toBe('compress');
    expect(s.hex.scale).toBe(10);
    expect(s.hex.rows).toBe(21);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('專案檔的形狀檢查', () => {
    expect(looksLikeSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(looksLikeSettings({ shape: 'square' })).toBe(false);
    expect(looksLikeSettings(null)).toBe(false);
  });
});
