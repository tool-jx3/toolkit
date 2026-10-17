/**
 * 幾何花紋產生器：種子（規格 3.1）、設定的整理（2.、3.8）、畫圖用的設定（F08、F34）、檔名（3.9）。
 * 種子的雜湊與亂數序列的期望值是從原作量到的。
 */
import { describe, expect, it } from 'vitest';
import { randomSeedText, seedNumber, seedRandom } from '@/tools/geo-bloom/random';
import {
  DEFAULT_SETTINGS,
  exportFileName,
  looksLikeSettings,
  RANGE,
  resolveConfig,
  SEED_MAX_LENGTH,
  type Settings,
  sanitizeSettings,
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
    expect(Object.values(d.shapes).every(Boolean)).toBe(true);
    expect(RANGE.width).toEqual([64, 8000]);
    expect(RANGE.lineWidth).toEqual([0.25, 40]);
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
