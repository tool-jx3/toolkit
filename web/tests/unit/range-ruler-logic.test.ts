/**
 * 距離量尺產生器（規格 range-ruler 第 1、3 節）：配色、排法、畫布尺寸、點擊判定、檔名、自訂格、讀檔整理。
 */
import { describe, expect, it } from 'vitest';
import {
  hexRulerFileName,
  hexRulerHit,
  hexRulerLayout,
  squareRulerFileName,
  squareRulerHit,
  squareRulerLayout,
} from '../../src/tools/range-ruler/layout';
import {
  cellLook,
  DEFAULT_HEX,
  DEFAULT_SETTINGS,
  DEFAULT_SQUARE,
  editorValues,
  type HexSettings,
  type SquareSettings,
  sanitizeSettings,
  schemeColor,
  schemeColors,
} from '../../src/tools/range-ruler/settings';

const sq = (p: Partial<SquareSettings> = {}): SquareSettings => ({ ...DEFAULT_SQUARE, ...p });
const hx = (p: Partial<HexSettings> = {}): HexSettings => ({ ...DEFAULT_HEX, ...p });

describe('配色（舊版的公式）', () => {
  it('中心一律白色；範圍 5 的彩虹、暖色、冷色、灰階', () => {
    expect(schemeColors(5, 'rainbow')).toEqual([
      '#ffffff',
      '#ff6666',
      '#ecff66',
      '#66ff8c',
      '#66c6ff',
      '#b366ff',
    ]);
    expect(schemeColors(3, 'heat')).toEqual(['#ffffff', '#ff4040', '#ff9740', '#ffee40']);
    expect(schemeColors(3, 'cold')).toEqual(['#ffffff', '#64d4ff', '#528af7', '#4040ee']);
    expect(schemeColors(3, 'mono')).toEqual(['#ffffff', '#dddddd', '#919191', '#444444']);
  });

  it('範圍 1 的固定色、無色是全透明、自訂是灰色', () => {
    expect(schemeColor(1, 1, 'rainbow')).toBe('#ff6464');
    expect(schemeColor(1, 1, 'heat')).toBe('#ff4040');
    expect(schemeColor(1, 1, 'cold')).toBe('#64d4ff');
    expect(schemeColor(1, 1, 'mono')).toBe('#aaaaaa');
    expect(schemeColors(2, 'none')).toEqual(['#00000000', '#00000000', '#00000000']);
    expect(schemeColors(2, 'custom')).toEqual(['#aaaaaa', '#aaaaaa', '#aaaaaa']);
  });

  it('預設：兩種形狀都是範圍 5、彩虹；文字大小方格 24、六角格 20；六角格預設使用網格', () => {
    expect(DEFAULT_SQUARE.distColors).toEqual(schemeColors(5, 'rainbow'));
    expect([DEFAULT_SQUARE.fontSize, DEFAULT_HEX.fontSize]).toEqual([24, 20]);
    expect(DEFAULT_HEX.fit).toBe(true);
    expect(DEFAULT_SQUARE.method).toBe('manhattan');
    expect(DEFAULT_HEX.method).toBe('steps');
  });
});

describe('方格量尺', () => {
  it('畫布＝(2 × 範圍 ＋ 1) × 大小；格數依距離算法', () => {
    const l = squareRulerLayout(sq());
    expect([l.width, l.height]).toEqual([528, 528]);
    expect(l.cells).toHaveLength(61);
    expect(squareRulerLayout(sq({ method: 'chebyshev' })).cells).toHaveLength(121);
    expect(squareRulerLayout(sq({ method: 'floor' })).cells).toHaveLength(109);
    /* 由上而下、由左而右；中心格在正中央 */
    expect(l.cells[0]).toMatchObject({ key: '0,-5', d: 5 });
    const center = l.cells.find((c) => c.key === '0,0');
    expect(center?.center).toEqual({ x: 264, y: 264 });
  });

  it('點擊判定與檔名', () => {
    expect(squareRulerHit(sq(), 264, 264)?.key).toBe('0,0');
    expect(squareRulerHit(sq(), 300, 250)?.key).toBe('1,0');
    expect(squareRulerHit(sq(), 5, 5)).toBeNull();
    expect(squareRulerHit(sq(), -1, 264)).toBeNull();
    expect(squareRulerFileName(sq())).toBe('grid_ruler_11x11.png');
    expect(squareRulerFileName(sq({ range: 3 }))).toBe('grid_ruler_7x7.png');
  });
});

describe('六角格量尺', () => {
  it('畫布尺寸（寬取整數部分）', () => {
    const size = (p: Partial<HexSettings>) => {
      const l = hexRulerLayout(hx(p));
      return [l.width, l.height];
    };
    expect(size({})).toEqual([576, 528]);
    expect(size({ fit: false })).toEqual([471, 528]);
    expect(size({ orientation: 'pointy' })).toEqual([528, 576]);
    expect(size({ method: 'straight' })).toEqual([672, 528]);
    expect(
      size({ method: 'straight', fit: false, orientation: 'pointy', range: 7, size: 40 }),
    ).toEqual([600, 600]);
    expect(size({ range: 2, size: 31, fit: false })).toEqual([143, 155]);
  });

  it('格數：步數是 3n(n＋1)＋1；直線另外算', () => {
    expect(hexRulerLayout(hx()).cells).toHaveLength(91);
    expect(hexRulerLayout(hx({ range: 2 })).cells).toHaveLength(19);
    expect(hexRulerLayout(hx({ method: 'straight' })).cells.length).toBeGreaterThan(80);
  });

  it('點擊判定：最近的中心、超過大小 × 0.65 是格子外', () => {
    const l = hexRulerLayout(hx());
    const c = l.cells.find((x) => x.key === '1,1');
    expect(c).toBeDefined();
    if (!c) return;
    expect(hexRulerHit(hx(), c.center.x + 5, c.center.y - 5)?.key).toBe('1,1');
    expect(hexRulerHit(hx(), 2, 2)).toBeNull();
    const p = hexRulerLayout(hx({ orientation: 'pointy' })).cells.find((x) => x.key === '-2,0');
    if (!p) throw new Error('沒有 -2,0');
    expect(hexRulerHit(hx({ orientation: 'pointy' }), p.center.x, p.center.y)?.key).toBe('-2,0');
  });

  it('檔名：使用網格時 hex_ruler_<寬>x<高>.png，否則 hex_ruler.png', () => {
    expect(hexRulerFileName(hx())).toBe('hex_ruler_24x22.png');
    expect(hexRulerFileName(hx({ orientation: 'pointy' }))).toBe('hex_ruler_22x24.png');
    expect(hexRulerFileName(hx({ fit: false }))).toBe('hex_ruler.png');
  });
});

describe('自訂格', () => {
  it('顯示：自訂優先，文字空白時顯示距離；沒有自訂時依距離的顏色', () => {
    const s = sq({
      customs: { '1,0': { text: '', color: '#123456', textColor: '#ff0000', fontSize: 30 } },
    });
    expect(cellLook(s, '1,0', 1)).toEqual({
      text: '1',
      color: '#123456',
      textColor: '#ff0000',
      fontSize: 30,
      custom: true,
    });
    expect(cellLook(s, '2,0', 2)).toMatchObject({ text: '2', color: '#ecff66', custom: false });
    expect(
      cellLook(
        sq({ customs: { '0,0': { text: '牆', color: '#000', textColor: '#fff', fontSize: 9 } } }),
        '0,0',
        0,
      ).text,
    ).toBe('牆');
  });

  it('編輯面板的初始值：文字＝距離、顏色＝該距離的顏色、文字顏色與大小＝整體設定', () => {
    expect(editorValues(sq(), '0,2', 2)).toEqual({
      text: '2',
      color: '#ecff66',
      textColor: '#000000',
      fontSize: 24,
    });
  });
});

describe('讀檔整理', () => {
  it('各距離的顏色數量一定是範圍 ＋ 1；壞的自訂格丟掉；文字最多 8 個字', () => {
    const s = sanitizeSettings({
      shape: 'hex',
      square: { range: 3, scheme: 'heat', distColors: ['#000000'] },
      hex: {
        range: 99,
        customs: {
          '1,2': { text: '一二三四五六七八九十', color: '#ff0000', fontSize: 500 },
          bad: { text: 'x' },
          '3,4': 'nope',
        },
      },
    });
    expect(s.square.distColors).toEqual(['#000000', '#ff4040', '#ff9740', '#ffee40']);
    expect(s.hex.range).toBe(20);
    expect(s.hex.distColors).toHaveLength(21);
    expect(Object.keys(s.hex.customs)).toEqual(['1,2']);
    expect(s.hex.customs['1,2']).toEqual({
      text: '一二三四五六七八',
      color: '#ff0000',
      textColor: '#000000',
      fontSize: 200,
    });
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
