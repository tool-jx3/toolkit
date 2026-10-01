/**
 * 輕量轉場 APNG 產生器：尺寸、檔名、預覽倍率、時間軸與透明度曲線（規格 2、3.2～3.5、4.2）。
 */
import { describe, expect, it } from 'vitest';
import {
  cycleMs,
  DEFAULT_SETTINGS,
  DURATIONS,
  directionVector,
  exportSize,
  fadeAlpha,
  frameSamples,
  parseHexColor,
  parseSide,
  previewScale,
  previewSide,
  previewSize,
  scaleLabel,
  transitionFileName,
  WIPE_COVER_TABLE,
  WipeField,
  wipeAlpha,
} from '@/tools/apng-wipe/wipe';

describe('尺寸', () => {
  it('預設集：方形 15×15、縱長 15×30、橫長 30×15', () => {
    expect(exportSize({ ...DEFAULT_SETTINGS, sizeKind: 'square' })).toEqual({
      width: 15,
      height: 15,
    });
    expect(exportSize({ ...DEFAULT_SETTINGS, sizeKind: 'portrait' })).toEqual({
      width: 15,
      height: 30,
    });
    expect(exportSize({ ...DEFAULT_SETTINGS, sizeKind: 'landscape' })).toEqual({
      width: 30,
      height: 15,
    });
  });

  it('自訂寬高：1～1200 的整數才合法（空白、0、小數、超過 1200 都不行）', () => {
    for (const ok of ['1', '20', '1200', ' 300 ']) expect(parseSide(ok)).not.toBeNull();
    for (const bad of ['', ' ', '0', '1.5', '1201', '5000', '-3', 'abc'])
      expect(parseSide(bad), bad).toBeNull();
    expect(exportSize({ ...DEFAULT_SETTINGS, sizeKind: 'free' })).toEqual({
      width: 20,
      height: 20,
    });
    expect(
      exportSize({ ...DEFAULT_SETTINGS, sizeKind: 'free', customWidth: '0', customHeight: '20' }),
    ).toBeNull();
  });

  it('預覽用的修正值：取整數部分、小於 1 或空白當 1、大於 1200 當 1200', () => {
    expect(previewSide('0')).toBe(1);
    expect(previewSide('1.5')).toBe(1);
    expect(previewSide('5000')).toBe(1200);
    expect(previewSide('')).toBe(1);
    expect(previewSide('abc')).toBe(1);
    expect(previewSide('46.9')).toBe(46);
    expect(
      previewSize({
        ...DEFAULT_SETTINGS,
        sizeKind: 'free',
        customWidth: '0',
        customHeight: '5000',
      }),
    ).toEqual({ width: 1, height: 1200 });
  });

  it('預覽倍率＝min(4, 180 ÷ 長邊)，標示四捨五入到小數一位；< 1 時不標數字', () => {
    const label = (w: number, h: number) => scaleLabel(previewScale(w, h));
    expect(label(15, 15)).toBe('4');
    expect(label(100, 20)).toBe('1.8');
    expect(label(46, 46)).toBe('3.9');
    expect(label(180, 90)).toBe('1');
    expect(label(15, 30)).toBe('4');
    expect(label(300, 300)).toBeNull();
    expect(previewScale(1200, 1200)).toBeCloseTo(0.15, 10);
  });
});

describe('檔名', () => {
  it('transition-<尺寸類型>-<轉場方式>-<變化方向>-<角度>deg.png', () => {
    expect(
      transitionFileName({
        ...DEFAULT_SETTINGS,
        sizeKind: 'square',
        mode: 'wipe',
        direction: 'cover',
        angle: 45,
      }),
    ).toBe('transition-square-wipe-cover-45deg.png');
    expect(transitionFileName(DEFAULT_SETTINGS)).toBe('transition-square-normal-cover-0deg.png');
    expect(
      transitionFileName({
        ...DEFAULT_SETTINGS,
        sizeKind: 'free',
        mode: 'normal',
        direction: 'reveal',
        angle: 270,
      }),
    ).toBe('transition-free-normal-reveal-270deg.png');
    expect(transitionFileName({ ...DEFAULT_SETTINGS, sizeKind: 'portrait' })).toMatch(
      /^transition-portrait-/,
    );
    expect(transitionFileName({ ...DEFAULT_SETTINGS, sizeKind: 'landscape' })).toMatch(
      /^transition-landscape-/,
    );
  });
});

describe('色碼', () => {
  it('只接受 # 加 6 位 16 進位，確定後轉小寫', () => {
    expect(parseHexColor('#ABCDEF')).toBe('#abcdef');
    expect(parseHexColor(' #28212f ')).toBe('#28212f');
    for (const bad of ['#abc', 'abcdef', '#abcdeg', '#abcdef0', '', 'rgb(1,2,3)'])
      expect(parseHexColor(bad), bad).toBeNull();
  });
});

describe('時間軸', () => {
  it('取樣數＝時長 × 30；第 k 點＝總毫秒 × k ÷ 取樣數（四捨五入）', () => {
    const s = frameSamples('normal', 1);
    expect(s).toHaveLength(30);
    expect(s.slice(0, 4).map((f) => f.time)).toEqual([0, 33, 67, 100]);
    /* 淡變不含 t＝1，最後一格停到總長 */
    expect(s[29]).toMatchObject({ time: 967, delay: 33 });
    expect(s.reduce((a, f) => a + f.delay, 0)).toBe(1000);
  });

  it('擦除多一格 t＝1 的最終影格，固定停 34 ms；總長＝時長＋34 ms', () => {
    for (const d of DURATIONS) {
      const s = frameSamples('wipe', d);
      expect(s).toHaveLength(Math.round(d * 30) + 1);
      expect(s[s.length - 1]).toMatchObject({ t: 1, delay: 34 });
      expect(s.reduce((a, f) => a + f.delay, 0)).toBe(Math.round(d * 1000) + 34);
      expect(cycleMs('wipe', d)).toBe(Math.round(d * 1000) + 34);
      expect(cycleMs('normal', d)).toBe(Math.round(d * 1000));
    }
  });
});

describe('淡變的透明度', () => {
  it('蓋上：0.25 前為 0，0.25～0.85 等速升到 255', () => {
    expect(fadeAlpha(0, 'cover')).toBe(0);
    expect(fadeAlpha(0.25, 'cover')).toBe(0);
    expect(fadeAlpha(0.4, 'cover')).toBe(64);
    expect(fadeAlpha(0.85, 'cover')).toBe(255);
    expect(fadeAlpha(1, 'cover')).toBe(255);
  });
  it('揭開：0.15 前為 255，0.15～0.75 等速降到 0（不是蓋上倒著播）', () => {
    expect(fadeAlpha(0, 'reveal')).toBe(255);
    expect(fadeAlpha(0.15, 'reveal')).toBe(255);
    expect(fadeAlpha(0.35, 'reveal')).toBe(170);
    expect(fadeAlpha(0.75, 'reveal')).toBe(0);
  });
});

describe('擦除的透明度', () => {
  it('表上的節點與規格 3.4 相同；揭開＝255 − 蓋上', () => {
    WIPE_COVER_TABLE.forEach((row, i) => {
      row.forEach((v, j) => {
        expect(wipeAlpha(i / 10, j / 5, 'cover')).toBe(v);
        expect(wipeAlpha(i / 10, j / 5, 'reveal')).toBe(255 - v);
      });
    });
  });

  it('方向：0° 往右（左邊先出現）、90° 往下、180° 往左、270° 往上，斜角依此類推', () => {
    expect(directionVector(0)).toEqual([1, 0]);
    expect(directionVector(45)).toEqual([1, 1]);
    expect(directionVector(90)).toEqual([0, 1]);
    expect(directionVector(180)).toEqual([-1, 0]);
    expect(directionVector(270)).toEqual([0, -1]);
    expect(directionVector(315)).toEqual([1, -1]);
  });

  it('q：以四個角的投影正規化；45° 時左上≈0、右下≈1、右上與左下＝0.5', () => {
    const W = 15;
    const H = 15;
    const f = new WipeField(W, H, 45);
    const q = (x: number, y: number) => f.qOfSlot[f.slotOf[y * W + x]];
    expect(q(0, 0)).toBeCloseTo(1 / 30, 10);
    expect(q(W - 1, H - 1)).toBeCloseTo(1 - 1 / 30, 10);
    expect(q(W - 1, 0)).toBeCloseTo(0.5, 10);
    expect(q(0, H - 1)).toBeCloseTo(0.5, 10);
    /* 0°：只看 x，同一欄 q 相同 */
    const g = new WipeField(100, 20, 0);
    expect(g.qOfSlot[g.slotOf[5]]).toBe(g.qOfSlot[g.slotOf[19 * 100 + 5]]);
    expect(g.qOfSlot[g.slotOf[0]]).toBeCloseTo(0.005, 10);
    /* 180°：反過來，右邊 q≈0 */
    const h = new WipeField(100, 20, 180);
    expect(h.qOfSlot[h.slotOf[99]]).toBeCloseTo(0.005, 10);
  });

  it('透明度只由 t 與 q 決定：不同尺寸在同一個 q 得到同樣的值', () => {
    /* 寬 10 的第 1 欄與寬 30 的第 4 欄：q 都是 0.15 */
    const a = new WipeField(10, 4, 0);
    const b = new WipeField(30, 90, 0);
    expect(a.qOfSlot[a.slotOf[1]]).toBeCloseTo(0.15, 12);
    expect(b.qOfSlot[b.slotOf[4]]).toBeCloseTo(0.15, 12);
    for (const t of [0.1, 0.33, 0.5, 0.77, 0.95]) {
      for (const dir of ['cover', 'reveal'] as const) {
        expect(a.levels(t, dir)[a.slotOf[1]]).toBe(b.levels(t, dir)[b.slotOf[4]]);
      }
    }
  });
});
