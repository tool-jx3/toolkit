/**
 * 幾何花紋產生器：種子（規格 3.1）、設定的整理（2.、3.8）、畫圖用的設定（F08、F34）、檔名（3.9）。
 * 種子的雜湊與亂數序列的期望值是從原作量到的。
 */
import { describe, expect, it } from 'vitest';
import { randomSeedText, seedNumber, seedRandom } from '@/tools/geo-bloom/random';
import {
  clampValue,
  DEFAULT_SETTINGS,
  exportFileName,
  LEGACY_FIELDS,
  looksLikeSettings,
  RANGE,
  resolveConfig,
  SEED_MAX_LENGTH,
  type Settings,
  sanitizeSettings,
  upgradeSettings,
} from '@/tools/geo-bloom/settings';

describe('種子（3.1）', () => {
  it('種子文字的雜湊和原作相同（UTF-16 碼元）', () => {
    expect(seedNumber('0')).toBe(1608966006);
    expect(seedNumber('abc')).toBe(50696745);
    expect(seedNumber('星座の夜')).toBe(2858926757);
    expect(seedNumber('tkmiz-01')).toBe(1619919146);
    expect(seedNumber('😀')).toBe(2342049946);
    expect(seedNumber('a'.repeat(100))).toBe(2228998521);
  });

  it('空白的種子當成「0」', () => {
    expect(seedNumber('')).toBe(seedNumber('0'));
  });

  it('亂數序列和原作相同（mulberry32）', () => {
    const r = seedRandom('abc');
    expect([r.next(), r.next(), r.next(), r.next(), r.next()]).toEqual([
      0.8397557286079973, 0.370647334959358, 0.20023633493110538, 0.12240628199651837,
      0.10869051772169769,
    ]);
    const z = seedRandom('');
    expect([z.next(), z.next()]).toEqual([0.17909707175567746, 0.7862529726698995]);
  });

  it('隨機種子：8 個英數字', () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSeedText();
      expect(s).toMatch(/^[0-9a-z]{8}$/);
    }
    expect(randomSeedText()).not.toBe(randomSeedText());
  });
});

describe('設定的整理（2.、3.8）', () => {
  it('缺的、型別不對的用預設；數值夾到範圍並取整數；線寬取 0.25 的倍數', () => {
    const s = sanitizeSettings({
      seed: 42,
      width: 99999,
      height: '30',
      maxShapes: 12.6,
      lineWidth: 2.4,
      shrink: -5,
      overlapMode: 'nope',
      shapes: { circle: false, square: 'yes' },
      background: 'red',
      lineColor: '#ABCDEF',
    });
    expect(s.seed).toBe(DEFAULT_SETTINGS.seed);
    expect(s.width).toBe(8000);
    expect(s.height).toBe(64);
    expect(s.maxShapes).toBe(13);
    expect(s.lineWidth).toBe(2.5);
    expect(s.shrink).toBe(30);
    expect(s.overlapMode).toBe('retry');
    expect(s.shapes).toEqual({ ...DEFAULT_SETTINGS.shapes, circle: false });
    expect(s.background).toBe(DEFAULT_SETTINGS.background);
    expect(s.lineColor).toBe('#abcdef');
  });

  it('不是物件時是整份預設；種子截到 100 字', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ seed: 'あ'.repeat(150) }).seed).toBe('あ'.repeat(SEED_MAX_LENGTH));
  });

  it('預設值（4.）', () => {
    const d = DEFAULT_SETTINGS;
    expect([d.width, d.height, d.maxShapes, d.maxLines, d.branchMin, d.branchMax]).toEqual([
      1600, 1600, 60, 120, 2, 7,
    ]);
    expect([d.maxDepth, d.maxRings, d.rootMin, d.rootMax, d.childMin, d.childMax]).toEqual([
      4, 5, 60, 180, 12, 70,
    ]);
    expect([d.shrink, d.lineMin, d.lineMax, d.pShape, d.pBranch, d.pDot, d.regularity]).toEqual([
      75, 60, 260, 70, 65, 40, 50,
    ]);
    expect([d.avoidOverlap, d.overlapMode, d.gap, d.lineAvoid, d.inBounds]).toEqual([
      true,
      'retry',
      8,
      false,
      true,
    ]);
    expect([d.background, d.transparent, d.lineColor, d.accentColor, d.pAccent]).toEqual([
      '#0e0f12',
      false,
      '#e8e4da',
      '#d9a441',
      15,
    ]);
    expect([d.lineWidth, d.pFill, d.fromEdge, d.lockSeed]).toEqual([2, 10, true, false]);
    expect(d.shapes).toEqual({
      circle: true,
      rings: true,
      semi: true,
      mix: true,
      square: true,
      doubleSquare: true,
      triCore: false,
      triRing: false,
    });
    expect(RANGE.width).toEqual([64, 8000]);
    expect(RANGE.lineWidth).toEqual([0.25, 40]);
  });

  it('原作 2026-10 的新設定：預設值與範圍（原作的欄位）', () => {
    const d = DEFAULT_SETTINGS;
    expect([d.pAttach, d.attachDepth, d.pDrop, d.pTri, d.triRing, d.noCross]).toEqual([
      0,
      0,
      0,
      30,
      'first',
      false,
    ]);
    expect([d.startRing, d.endAtRing, d.rootRings, d.minRings]).toEqual(['ring2', true, true, 3]);
    expect([d.morse, d.solidInner, d.solidFollow, d.pMorse, d.morseDot, d.morseDash]).toEqual([
      true,
      2,
      true,
      100,
      6,
      3,
    ]);
    expect([d.morseGap, d.morseLetterGap, d.morseWordGap, d.pMorseDash, d.pMorseWord]).toEqual([
      1, 3, 7, 45, 18,
    ]);
    expect([d.morseWidth, d.morseShrink, d.morseRound, d.morseCap, d.morseText]).toEqual([
      1,
      60,
      false,
      true,
      '',
    ]);
    expect([d.bridges, d.pBridge]).toEqual([false, 50]);
    expect([RANGE.attachDepth, RANGE.minRings, RANGE.solidInner]).toEqual([
      [-50, 80],
      [2, 50],
      [0, 20],
    ]);
    expect([RANGE.morseDot, RANGE.morseDash, RANGE.morseGap, RANGE.morseLetterGap]).toEqual([
      [1, 80],
      [1.5, 12],
      [0.5, 8],
      [1, 15],
    ]);
    expect([RANGE.morseWordGap, RANGE.morseWidth]).toEqual([
      [2, 30],
      [0.25, 5],
    ]);
  });

  it('一格：0.5（短點、長點、字母與單字間隔）、0.25（符號間隔、摩斯線的粗細、線寬），其他整數', () => {
    expect(clampValue('morseDot', 6.3)).toBe(6.5);
    expect(clampValue('morseDash', 1.1)).toBe(1.5);
    expect(clampValue('morseGap', 0.3)).toBe(0.5);
    expect(clampValue('morseGap', 1.13)).toBe(1.25);
    expect(clampValue('morseWidth', 0.6)).toBe(0.5);
    expect(clampValue('morseWordGap', 40)).toBe(30);
    expect(clampValue('attachDepth', -70)).toBe(-50);
    expect(clampValue('pTri', 12.6)).toBe(13);
  });

  it('新的選項：不在清單裡時用預設', () => {
    const s = sanitizeSettings({ startRing: 'all', triRing: 'r', morseText: 'x'.repeat(300) });
    expect([s.startRing, s.triRing, s.morseText.length]).toEqual(['ring2', 'first', 200]);
  });
});

describe('舊的資料版本（3.8）', () => {
  /** 資料版本 1（原作 3097b39 時）的設定：沒有新的欄位、圖形種類只有六個 */
  const v1 = {
    seed: 'old',
    lockSeed: true,
    width: 1200,
    height: 900,
    maxShapes: 80,
    shapes: {
      circle: true,
      rings: false,
      semi: true,
      mix: true,
      square: false,
      doubleSquare: true,
    },
    overlapMode: 'line',
    lineWidth: 3.5,
  };

  it('版本 1：沒有的欄位補舊版的值（沒有摩斯環、中央是圓或同心圓、線從最外圈出發、同心圓至少 2 層）', () => {
    const s = upgradeSettings(v1, 1);
    expect(s).toMatchObject({ ...LEGACY_FIELDS, seed: 'old', lockSeed: true, width: 1200 });
    expect([s.rootRings, s.minRings, s.startRing, s.morse, s.bridges]).toEqual([
      false,
      2,
      'edge',
      false,
      false,
    ]);
    expect(s.shapes).toEqual({ ...v1.shapes, triCore: false, triRing: false });
    expect([s.overlapMode, s.lineWidth, s.maxShapes]).toEqual(['line', 3.5, 80]);
    /* 其他新欄位是預設值 */
    expect([s.morseDot, s.pTri, s.endAtRing]).toEqual([6, 30, true]);
  });

  it('版本 1 但已經有的欄位照用；版本 2 照一般的整理（缺的用新的預設）', () => {
    expect(upgradeSettings({ ...v1, morse: true }, 1).morse).toBe(true);
    const s = upgradeSettings(v1, 2);
    expect([s.rootRings, s.minRings, s.startRing, s.morse]).toEqual([true, 3, 'ring2', true]);
    expect(upgradeSettings(null, 1)).toEqual(DEFAULT_SETTINGS);
  });

  it('專案檔看起來是不是這個工具的設定', () => {
    expect(looksLikeSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(looksLikeSettings({ seed: 'a' })).toBe(false);
    expect(looksLikeSettings(null)).toBe(false);
  });
});

describe('畫圖用的設定', () => {
  const base: Settings = DEFAULT_SETTINGS;

  it('百分比除以 100（不是乘 0.01）', () => {
    const c = resolveConfig({
      ...base,
      pShape: 7,
      pBranch: 29,
      pDot: 57,
      regularity: 3,
      shrink: 35,
    });
    expect(c.pShape).toBe(7 / 100);
    expect(c.pBranch).toBe(29 / 100);
    expect(c.pDot).toBe(57 / 100);
    expect(c.regularity).toBe(3 / 100);
    expect(c.shrink).toBe(35 / 100);
    expect(c.pAccent).toBe(15 / 100);
    expect(c.pFill).toBe(10 / 100);
  });

  it('最小大於最大時互換（F08）', () => {
    const c = resolveConfig({
      ...base,
      branchMin: 9,
      branchMax: 3,
      rootMin: 300,
      rootMax: 100,
      childMin: 80,
      childMax: 20,
      lineMin: 400,
      lineMax: 100,
    });
    expect([c.branchMin, c.branchMax, c.rootMin, c.rootMax]).toEqual([3, 9, 100, 300]);
    expect([c.childMin, c.childMax, c.lineMin, c.lineMax]).toEqual([20, 80, 100, 400]);
  });

  it('種類依固定的順序；一個都沒勾時只有圓（F34）', () => {
    expect(resolveConfig(base).shapes).toEqual([
      'circle',
      'rings',
      'semi',
      'mix',
      'square',
      'doubleSquare',
    ]);
    const none = Object.fromEntries(Object.keys(base.shapes).map((k) => [k, false]));
    expect(resolveConfig({ ...base, shapes: none as Settings['shapes'] }).shapes).toEqual([
      'circle',
    ]);
    expect(
      resolveConfig({
        ...base,
        shapes: { ...(none as Settings['shapes']), doubleSquare: true, semi: true },
      }).shapes,
    ).toEqual(['semi', 'doubleSquare']);
  });

  it('寬高夾到 64～8000', () => {
    const c = resolveConfig({ ...base, width: 10, height: 9000 });
    expect([c.width, c.height]).toEqual([64, 8000]);
  });
});

describe('檔名（3.9）', () => {
  it('geometric_<種子>.png／.svg', () => {
    expect(exportFileName('abc', 'png')).toBe('geometric_abc.png');
    expect(exportFileName('星座の夜', 'svg')).toBe('geometric_星座の夜.svg');
  });

  it('空白的種子：geometric_.png（同原作）', () => {
    expect(exportFileName('', 'png')).toBe('geometric_.png');
  });

  it('檔名不能用的字元換成「_」', () => {
    expect(exportFileName('a/b:c*?', 'png')).toBe('geometric_a_b_c__.png');
  });

  it('空白與結尾的「.」照共用的安全檔名規則（7.1 核准）', () => {
    expect(exportFileName('  a b  c ', 'png')).toBe('geometric_ a b c.png');
    expect(exportFileName('abc.', 'png')).toBe('geometric_abc.png');
    expect(exportFileName('a　b', 'png')).toBe('geometric_a b.png');
    expect(exportFileName('..', 'png')).toBe('geometric_.png');
  });
});
