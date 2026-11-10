/**
 * 原作（Nuts-ABCd／floria_canvas）的資料格式（規格 2.2）：讀成一張畫布、寫回原作的格式。
 */
import { describe, expect, it } from 'vitest';
import {
  encodeLegacyName,
  LegacyError,
  looksLikeLegacy,
  parseLegacy,
  serializeLegacy,
} from '@/tools/floria-veins/model/legacy';
import { sampleDoc } from '@/tools/floria-veins/model/sample';
import { type Pt, UNIT, type VeinCanvas } from '@/tools/floria-veins/model/types';

const U = UNIT;
const P = (x: number, y: number): Pt => [x * U, y * U];

/**
 * 原作 5a9a582 實際存在瀏覽器的字串（多角形＋塗色＋兩格傷害；四邊與傷害格的邊是看不見的線「-h」，
 * 預設的對角線沒有顏色，畫的線與塗色帶顏色）
 */
const SAVED =
  'GS:1200|GN:11|NM:PC%20Name|CD:F:P:8400_8400-P:9600_8400-P:9600_9600-P:8400_9600-~F:P:9600_8400-P:10800_8400-P:10800_9600-P:9600_9600-' +
  '|CF:F:P:1200_1200-P:6000_1200-P:3600_4800-P:1200_1200-#0000FF' +
  '|CL:L:P:0_0-P:0_13200-h~L:P:0_13200-P:13200_13200-h~L:P:13200_13200-P:13200_0-h~L:P:13200_0-P:0_0-h~L:P:0_0-P:13200_13200-' +
  '~L:P:1200_1200-P:6000_1200-#0000FF~L:P:6000_1200-P:3600_4800-#0000FF~L:P:3600_4800-P:1200_1200-#0000FF' +
  '~L:P:8400_8400-P:9600_8400-h~L:P:9600_8400-P:9600_9600-h~L:P:9600_9600-P:8400_9600-h~L:P:8400_9600-P:8400_8400-h' +
  '~L:P:9600_8400-P:10800_8400-h~L:P:10800_8400-P:10800_9600-h~L:P:10800_9600-P:9600_9600-h~L:P:9600_9600-P:9600_8400-h';

/** 原作附的範例（Mob2）：舊的寫法，沒有顏色的線與塗色、尾巴沒有「-」 */
const SAMPLE_MOB2 =
  'GS:1200|GN:6|NM:Mob2|CD:F:P:1200_1200-P:2400_1200-P:2400_2400-P:1200_2400~F:P:6000_4800-P:7200_4800-P:7200_6000-P:6000_6000' +
  '|CF:F:P:5760_3600-P:4950_2250-P:3600_3600-P:5760_3600' +
  '|CL:L:P:0_0-P:7200_7200~L:P:0_3600-P:7200_3600~L:P:3600_0-P:0_6000~L:P:0_6000-P:7200_6000~L:P:7200_6000-P:3600_0~L:P:7200_0-P:0_7200' +
  '~L:P:1200_1200-P:2400_1200-h~L:P:2400_1200-P:2400_2400-h~L:P:2400_2400-P:1200_2400-h~L:P:1200_2400-P:1200_1200-h' +
  '~L:P:6000_4800-P:7200_4800-h~L:P:7200_4800-P:7200_6000-h~L:P:7200_6000-P:6000_6000-h~L:P:6000_6000-P:6000_4800-h';

/** 原作讀檔時的檢查：URL 編碼後只能有英數與「:|_-~%#」 */
const originalAccepts = (s: string) => !/[^a-zA-Z0-9:|_\-~%#]/.test(encodeURIComponent(s));

describe('讀原作的資料', () => {
  it('現在的原作存的字串：名字解碼、看不見的線不收、預設的對角線不收、顏色小寫', () => {
    const r = parseLegacy(SAVED);
    expect(r.skipped).toBe(0);
    expect(r.canvas.name).toBe('PC Name');
    expect(r.canvas.size).toBe(11);
    expect(r.canvas.lines).toEqual([
      { a: P(1, 1), b: P(5, 1), color: '#0000ff' },
      { a: P(5, 1), b: P(3, 4), color: '#0000ff' },
      { a: P(3, 4), b: P(1, 1), color: '#0000ff' },
    ]);
    /* 回到起點的那一點去掉 */
    expect(r.canvas.fills).toEqual([{ pts: [P(1, 1), P(5, 1), P(3, 4)], color: '#0000ff' }]);
    expect(r.canvas.damage).toEqual([
      [7, 7],
      [8, 7],
    ]);
  });

  it('原作附的範例（舊的寫法）：沒有顏色的線與塗色用原作的預設色', () => {
    const r = parseLegacy(SAMPLE_MOB2);
    expect(r.canvas.size).toBe(6);
    expect(r.canvas.lines).toHaveLength(5);
    expect(r.canvas.lines.every((l) => l.color === '#0000ff')).toBe(true);
    expect(r.canvas.fills).toEqual([
      {
        pts: [
          [5760, 3600],
          [4950, 2250],
          [3600, 3600],
        ],
        color: '#00c0ff',
      },
    ]);
    expect(r.canvas.damage).toEqual([
      [1, 1],
      [5, 4],
    ]);
    /* 本站的範例就是這份資料 */
    const sample = sampleDoc().canvases.find((c) => c.name === '隨從2') as VeinCanvas;
    expect(sample.lines).toEqual(r.canvas.lines);
    expect(sample.fills).toEqual(r.canvas.fills);
    expect(sample.damage).toEqual(r.canvas.damage);
  });

  it('貼上時夾帶的換行與空白不影響；同一條線只留最後一條', () => {
    const r = parseLegacy(' GN:11|NM:A\n|CL:L:P:0_0-P:1200_0-#00A000~\nL:P:1200_0-P:0_0-#C00000 ');
    expect(r.canvas.lines).toEqual([{ a: P(1, 0), b: P(0, 0), color: '#c00000' }]);
  });

  it('看不懂的物件略過並計數；超出畫布、不在格點上的線不收', () => {
    const r = parseLegacy(
      'GN:6|NM:x|CL:L:P:0_0-P:99999_0-~L:P:100_0-P:1200_0-~Q:zzz~L:P:0_0-P:1200_0-#GGGGGG|CD:F:P:0_0-P:2400_0-P:2400_2400-P:0_2400',
    );
    expect(r.canvas.lines).toEqual([]);
    expect(r.canvas.damage).toEqual([]);
    expect(r.skipped).toBe(5);
  });

  it('不是原作的資料、沒有格數、格數不對：丟出 LegacyError', () => {
    expect(() => parseLegacy('')).toThrow(LegacyError);
    expect(() => parseLegacy('{"format":"trpg-toolkit-project"}')).toThrow(LegacyError);
    expect(() => parseLegacy('GN:99|NM:x')).toThrow(/格數/);
    expect(() => parseLegacy('GN:1|NM:x')).toThrow(LegacyError);
    expect(looksLikeLegacy(SAVED)).toBe(true);
    expect(looksLikeLegacy('GN:6')).toBe(true);
    expect(looksLikeLegacy('hello')).toBe(false);
  });
});

describe('寫成原作的格式', () => {
  const c: VeinCanvas = {
    id: 'x',
    name: '貓(1).v2!',
    size: 11,
    lines: [{ a: P(1, 1), b: P(5, 1), color: '#00a000' }],
    fills: [{ pts: [P(1, 1), P(5, 1), P(3, 4)], color: '#c00000' }],
    damage: [[2, 3]],
  };

  it('四邊（看不見）與對角線在最前面、傷害格的邊是看不見的線、顏色大寫；原作的檢查會通過', () => {
    const s = serializeLegacy(c);
    expect(s.startsWith('GS:1200|GN:11|NM:')).toBe(true);
    expect(s).toContain(
      '|CL:L:P:0_0-P:0_13200-h~L:P:0_13200-P:13200_13200-h~L:P:13200_13200-P:13200_0-h~L:P:13200_0-P:0_0-h~L:P:0_0-P:13200_13200-~L:P:1200_1200-P:6000_1200-#00A000~',
    );
    expect(s).toContain('|CD:F:P:2400_3600-P:3600_3600-P:3600_4800-P:2400_4800-|');
    expect(s).toContain('|CF:F:P:1200_1200-P:6000_1200-P:3600_4800-#C00000|');
    expect(s).toContain('L:P:2400_3600-P:3600_3600-h');
    expect(originalAccepts(s)).toBe(true);
    /* encodeURIComponent 不編的 . ! * ' ( ) 也編掉（原作不接受這些字） */
    expect(encodeLegacyName("a.b!c*d'e(f)")).toBe('a%2Eb%21c%2Ad%27e%28f%29');
    expect(originalAccepts(encodeURIComponent('a.b'))).toBe(false);
  });

  it('寫出去再讀回來相同', () => {
    const r = parseLegacy(serializeLegacy(c));
    expect(r.skipped).toBe(0);
    expect(r.canvas).toEqual({
      name: c.name,
      size: 11,
      lines: c.lines,
      fills: c.fills,
      damage: c.damage,
    });
    for (const s of sampleDoc().canvases) {
      const back = parseLegacy(serializeLegacy(s)).canvas;
      expect(back.lines).toEqual(s.lines);
      expect(back.fills).toEqual(s.fills);
      expect(back.damage).toEqual(s.damage);
    }
  });
});
