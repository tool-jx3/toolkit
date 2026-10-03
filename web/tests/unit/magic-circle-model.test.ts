/**
 * 魔法陣製作器：資料（規格 3.5、3.7、3.8、3.9）——範本、新元素、讀入時的修正、檔名、匯出規則、盧恩、對齊計畫、文字外框。
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT_IDS,
  exportFrames,
  exportSizeOf,
  isAnimated,
  stillBaseName,
} from '../../src/tools/magic-circle/exportRules';
import {
  actionablePlans,
  alignEnabled,
  elementBounds,
  elementCenter,
  layoutBounds,
  type Measure,
  planAlignment,
  textBounds,
} from '../../src/tools/magic-circle/layout';
import {
  baseProject,
  blankFrom,
  classicTemplate,
  createCircle,
  createPath,
  createText,
  fileBase,
  looksLikeLegacyProject,
  type McProject,
  newElementStart,
  normalizeProject,
  parseDash,
  pathPoint,
  projectFileName,
  runeTemplate,
  sigilTemplate,
} from '../../src/tools/magic-circle/model';
import { convertLatinToRunes, filterRunes, RUNE_SETS } from '../../src/tools/magic-circle/runes';

/** 假的量測：每個字寬 0.5 字級、置中對齊 */
const measure: Measure = (font, align, line) => {
  const size = Number.parseFloat(font);
  const w = [...line].length * size * 0.5;
  return {
    width: w,
    actualBoundingBoxLeft: align === 'center' ? w / 2 : align === 'right' ? w : 0,
    actualBoundingBoxRight: align === 'center' ? w / 2 : align === 'left' ? w : 0,
    actualBoundingBoxAscent: size * 0.7,
    actualBoundingBoxDescent: size * 0.1,
  };
};

describe('範本', () => {
  it('古典魔法陣：7 個元素、12 份對稱、選取放射盧恩裝飾', () => {
    const t = classicTemplate();
    const p = t.project;
    expect(p.document).toEqual({
      name: '古典魔法陣',
      width: 1000,
      height: 1000,
      background: '#070a17',
      transparent: false,
    });
    expect(p.symmetry).toMatchObject({ enabled: true, count: 12, centerX: 500, centerY: 500 });
    expect(p.animation).toEqual({ duration: 4, fps: 24, plays: 0 });
    expect(p.elements.map((e) => e.name)).toEqual([
      '外圈環',
      '外圈輔助線',
      '內圈環',
      '中央六芒圖樣',
      '放射盧恩裝飾',
      '放射寶石點',
      '中央核心',
    ]);
    expect(p.elements.map((e) => e.symmetry)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
    expect(t.selectedId).toBe(p.elements[4].id);
    const [outer, guide, , star, spoke, gem, core] = p.elements;
    expect(outer).toMatchObject({
      type: 'circle',
      rx: 378,
      style: { stroke: '#79e7ff', strokeWidth: 8, glowBlur: 34, glowStrength: 1.35 },
    });
    expect(guide.style.dash).toEqual([13, 8]);
    expect(guide.animation).toMatchObject({ mode: 'draw', start: 0.18, duration: 1.25 });
    expect(star).toMatchObject({ type: 'path', closed: true });
    expect(star.type === 'path' && star.points).toHaveLength(12);
    expect(spoke.animation).toMatchObject({
      mode: 'drawGlow',
      start: 1.05,
      duration: 0.75,
      copyStagger: 0.055,
    });
    expect(gem.animation).toMatchObject({ mode: 'scaleIn', copyStagger: 0.045 });
    expect(core.animation).toMatchObject({ mode: 'pulse', start: 1.8, duration: 1.2 });
    expect(core.style).toMatchObject({ fillEnabled: true, fill: '#8c76ff44', glowStrength: 2 });
  });

  it('盧恩輪、簽名', () => {
    const r = runeTemplate();
    expect(r.project.document.background).toBe('#100711');
    expect(r.project.symmetry.count).toBe(10);
    const glyph = r.project.elements[3];
    expect(glyph).toMatchObject({ type: 'text', text: 'ᛟ', fontSize: 52, symmetry: true });
    expect(glyph.style).toMatchObject({
      fill: '#ffd4f6',
      stroke: '#ffd4f6',
      glowColor: '#ff58d0',
      fillEnabled: true,
      strokeWidth: 1.5,
    });
    expect(r.selectedId).toBe(glyph.id);
    expect(r.project.elements[2].type === 'path' && r.project.elements[2].points).toHaveLength(5);
    const s = sigilTemplate();
    expect(s.project.document).toMatchObject({ width: 1200, height: 600, transparent: true });
    expect(s.project.symmetry).toMatchObject({ enabled: false, count: 1 });
    expect(s.project.snap).toMatchObject({
      grid: false,
      radial: false,
      angles: false,
      center: true,
    });
    expect(s.project.animation.duration).toBe(3);
    const stroke = s.project.elements[0];
    expect(stroke.type === 'path' && stroke.points).toHaveLength(8);
    expect(stroke.style).toMatchObject({ strokeWidth: 16, glowStrength: 1.7, shadowBlur: 8 });
  });

  it('空白：保留設定、清空元素；新元素的開始時間', () => {
    const p = classicTemplate().project;
    const b = blankFrom(p);
    expect(b.elements).toEqual([]);
    expect(b.symmetry).toEqual(p.symmetry);
    expect(newElementStart(p)).toBeCloseTo(0.56);
    const many = { ...p, elements: Array.from({ length: 60 }, () => createCircle(0, 0, 1)) };
    expect(newElementStart(many)).toBeCloseTo(3.8);
    const t = createText(1, 2);
    expect(t).toMatchObject({
      text: 'ᚱ',
      fontSize: 54,
      fontFamily: 'serif',
      textAlign: 'center',
      symmetry: true,
    });
    expect(t.style).toMatchObject({ fillEnabled: true, fill: '#a5f0ff', strokeWidth: 1.5 });
    expect(t.animation.mode).toBe('fadeIn');
    expect(baseProject().symmetry.count).toBe(8);
  });
});

describe('讀入時的修正（舊版專案檔）', () => {
  it('夾住尺寸、補預設值、循環換成播放次數、保留播放頭與選取', () => {
    const n = normalizeProject({
      version: 2,
      document: { width: 99999, height: 'x', background: '#ABCDEF80', transparent: 1 },
      symmetry: { count: 6 },
      animation: { duration: 3, loop: false, playhead: 1.25 },
      elements: [
        { type: 'circle', x: 1, y: 2, rx: 3, ry: 4, style: { stroke: '#FFF' } },
        {
          id: 'p1',
          type: 'path',
          points: [{ x: 1, y: 2, outX: 5 }],
          style: { dash: [5, -1, 'a', 2] },
          animation: { mode: 'bogus' },
        },
        { id: 'p1', type: 'text', text: 'ᚠ' },
      ],
      selectedId: 'p1',
    });
    expect(n.project.document).toEqual({
      name: '載入的魔法陣',
      width: 4096,
      height: 1000,
      background: '#abcdef',
      transparent: false,
    });
    expect(n.project.symmetry).toEqual({
      enabled: true,
      count: 6,
      mirror: false,
      centerX: 2048,
      centerY: 500,
      offset: 0,
    });
    expect(n.project.snap).toMatchObject({
      enabled: true,
      gridSize: 25,
      angleStep: 15,
      threshold: 11,
    });
    expect(n.project.animation).toEqual({ duration: 3, fps: 24, plays: 1 });
    expect(n.playhead).toBe(1.25);
    expect(n.selectedId).toBe('p1');
    const [c, p, t] = n.project.elements;
    expect(c).toMatchObject({
      type: 'circle',
      name: '圓形',
      visible: true,
      locked: false,
      symmetry: true,
    });
    expect(c.style.stroke).toBe('#ffffff');
    expect(c.style.glowBlur).toBe(24);
    expect(p).toMatchObject({ id: 'p1', name: '路徑', closed: false });
    expect(p.type === 'path' && p.points[0]).toEqual({
      x: 1,
      y: 2,
      inX: 1,
      inY: 2,
      outX: 5,
      outY: 2,
      smooth: false,
    });
    expect(p.style.dash).toEqual([5, 2]);
    expect(p.animation.mode).toBe('draw');
    expect(t.id).not.toBe('p1');
    expect(t).toMatchObject({ type: 'text', name: '文字', fontSize: 54 });
  });

  it('新版的資料、不合格的輸入', () => {
    const p = classicTemplate().project;
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(n.project).toEqual(p);
    expect(n.playhead).toBeNull();
    expect(normalizeProject({ animation: { loop: true } }).project.animation.plays).toBe(0);
    expect(normalizeProject({ animation: { plays: 3 } }).project.animation.plays).toBe(3);
    expect(() => normalizeProject(null)).toThrow('專案資料的格式不正確。');
    expect(() => normalizeProject([1])).toThrow();
    expect(looksLikeLegacyProject({ document: {}, elements: [] })).toBe(true);
    expect(looksLikeLegacyProject({ format: 'trpg-toolkit-project', data: {} })).toBe(false);
  });
});

describe('檔名與匯出規則', () => {
  it('名稱主體：禁用字元與空白換成 -、最多 80 字、空白時 arcana', () => {
    expect(fileBase('古典魔法陣')).toBe('古典魔法陣');
    expect(fileBase('  my circle: v2 ')).toBe('my-circle--v2');
    expect(fileBase('a/b\\c*?')).toBe('a-b-c-');
    expect(fileBase('   ')).toBe('arcana');
    expect(fileBase('字'.repeat(100))).toHaveLength(80);
    expect(projectFileName('古典魔法陣', new Date(2026, 9, 2, 9, 5))).toBe(
      '古典魔法陣-20261002-0905.arcana.json',
    );
    expect(stillBaseName('古典魔法陣', 4)).toBe('古典魔法陣-4.00s');
    expect(stillBaseName('x', 1.234)).toBe('x-1.23s');
  });

  it('影格：⌈長度 × FPS⌉ 格、第 i 格畫 i ÷ FPS 秒', () => {
    const f = exportFrames(4, 24);
    expect(f).toHaveLength(96);
    expect(f[1]).toEqual({ ms: 1000 / 24, t: 1 / 24 });
    expect(f[95].t).toBeCloseTo(95 / 24);
    expect(exportFrames(0.7, 30)).toHaveLength(21);
    expect(exportFrames(1.01, 10)).toHaveLength(11);
    expect(
      exportSizeOf(
        {
          document: {
            name: '',
            width: 1000,
            height: 600,
            background: '#000000',
            transparent: false,
          },
        },
        0.25,
      ),
    ).toEqual({ width: 250, height: 150 });
    expect(
      exportSizeOf(
        {
          document: { name: '', width: 999, height: 64, background: '#000000', transparent: false },
        },
        1.5,
      ),
    ).toEqual({ width: 1499, height: 96 });
    expect(EXPORT_FORMAT_IDS.filter(isAnimated)).toEqual(['gif', 'apng', 'webp']);
  });
});

describe('虛線欄', () => {
  it('逗號或空白分隔、略過空片段與負數、最多 16 個', () => {
    expect(parseDash('20, 10')).toEqual([20, 10]);
    expect(parseDash(' 20 , 10 ')).toEqual([20, 10]);
    expect(parseDash('5,-1,a,2')).toEqual([5, 2]);
    expect(parseDash('')).toEqual([]);
    expect(parseDash(Array.from({ length: 20 }, (_, i) => i).join(' '))).toHaveLength(16);
  });
});

describe('盧恩', () => {
  it('字母表的字數', () => {
    expect(RUNE_SETS.elder.runes).toHaveLength(24);
    expect(RUNE_SETS.younger.runes).toHaveLength(16);
    expect(RUNE_SETS.futhorc.runes).toHaveLength(29);
  });

  it('近似轉換：最長的拼寫優先、大寫視為小寫、其他字元照抄', () => {
    expect(convertLatinToRunes('futhark, thing', 'elder')).toBe('ᚠᚢᚦᚨᚱᚲ, ᚦᛁᛜ');
    expect(convertLatinToRunes('Odin', 'younger')).toBe('ᚬᛏᛁᚾ');
    expect(convertLatinToRunes('earth', 'futhorc')).toBe('ᛠᚱᚦ');
    expect(convertLatinToRunes('Quix 9!', 'elder')).toBe('ᚲᚹᚢᛁᚲᛊ 9!');
    expect(convertLatinToRunes('', 'elder')).toBe('');
  });

  it('搜尋：字形、讀音、名稱、中文讀法', () => {
    expect(filterRunes('elder', 'ng').map((r) => r.glyph)).toEqual(['ᛜ']);
    expect(filterRunes('elder', '奧薩拉').map((r) => r.name)).toEqual(['Othala']);
    expect(filterRunes('elder', 'FEHU')).toHaveLength(1);
    expect(filterRunes('younger', '')).toHaveLength(16);
    expect(filterRunes('futhorc', 'zzz')).toEqual([]);
  });
});

describe('外框與對齊計畫', () => {
  it('文字外框：上緣至少 0.8 字級、下緣至少 0.2 字級、外擴線寬一半', () => {
    const t = createText(100, 200, 'ab', { fontSize: 40 });
    expect(textBounds(t, measure)).toEqual({
      minX: 100 - 20 - 0.75,
      minY: 200 - 32 - 0.75,
      maxX: 120.75,
      maxY: 208.75,
    });
    const one = createText(0, 0, 'i', { fontSize: 40, textAlign: 'left' });
    const b = textBounds(one, measure);
    expect(b.maxX - b.minX).toBeCloseTo(40 * 0.5 + 1.5);
    const multi = createText(0, 0, 'a\nb', { fontSize: 10 });
    expect(textBounds(multi, measure).maxY).toBeCloseTo(12 + 2 + 0.75);
  });

  it('版面外框、中心', () => {
    const c = createCircle(100, 100, 50, 50, { style: { strokeWidth: 10 } });
    const lb = layoutBounds(c, measure);
    expect(lb.minX).toBeCloseTo(45, 1);
    expect(lb.maxY).toBeCloseTo(155, 1);
    expect(elementCenter(c, measure)).toEqual({ x: 100, y: 100 });
    const p = createPath([pathPoint(0, 0), pathPoint(100, 40)]);
    expect(elementCenter(p, measure)).toEqual({ x: 50, y: 20 });
    expect(elementBounds(p, measure)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 40 });
  });

  const twoBoxes = (): McProject => {
    const p = baseProject();
    p.elements = [
      createPath([pathPoint(100, 100), pathPoint(200, 100)], { style: { strokeWidth: 0 } }),
      createPath([pathPoint(300, 300), pathPoint(350, 300)], { style: { strokeWidth: 0 } }),
      {
        ...createPath([pathPoint(600, 600), pathPoint(700, 600)], { style: { strokeWidth: 0 } }),
        locked: true,
      },
    ];
    return p;
  };

  it('邊界對齊：畫布、選取範圍（含鎖定的參考）、基準元素', () => {
    const p = twoBoxes();
    const [a, b, locked] = p.elements;
    const sel = { selected: p.elements, key: b };
    const canvas = planAlignment(p, sel, 'canvas', 'align-left', measure);
    expect(canvas).toEqual({
      ok: true,
      plans: [
        { id: a.id, dx: -100, dy: 0 },
        { id: b.id, dx: -300, dy: 0 },
      ],
    });
    const selection = planAlignment(p, sel, 'selection', 'align-right', measure);
    expect(selection.ok && selection.plans).toEqual([
      { id: a.id, dx: 500, dy: 0 },
      { id: b.id, dx: 350, dy: 0 },
    ]);
    const key = planAlignment(p, sel, 'key', 'align-top', measure);
    expect(key.ok && key.plans).toEqual([{ id: a.id, dx: 0, dy: 200 }]);
    expect(
      planAlignment(p, { selected: [locked], key: locked }, 'canvas', 'align-left', measure),
    ).toEqual({ ok: false, reason: 'noTargets' });
    expect(alignEnabled(p, { selected: [a], key: a }, 'selection', 'align-left')).toBe(false);
    expect(alignEnabled(p, { selected: [a, b], key: b }, 'key', 'align-left')).toBe(true);
    expect(alignEnabled(p, { selected: [a, b], key: b }, 'canvas', 'distribute-x')).toBe(false);
  });

  it('對稱尺對齊：中心、最近對稱線、半徑等距；鏡射與關閉時的限制', () => {
    const p = baseProject();
    p.symmetry.count = 4;
    const mk = (x: number, y: number) =>
      createPath([pathPoint(x - 5, y), pathPoint(x + 5, y)], {
        symmetry: false,
        style: { strokeWidth: 0 },
      });
    p.elements = [mk(500, 300), mk(530, 200), mk(500, 100)];
    const [a, b, c] = p.elements;
    const sel = { selected: p.elements, key: a };
    const center = planAlignment(p, sel, 'canvas', 'symmetry-center', measure);
    expect(center.ok && center.plans[0]).toEqual({ id: a.id, dx: 0, dy: 200 });
    const guide = planAlignment(p, sel, 'canvas', 'symmetry-guide', measure);
    expect(guide.ok && actionablePlans(guide.plans).map((x) => x.id)).toEqual([b.id]);
    const radius = planAlignment(p, sel, 'canvas', 'symmetry-radius-space', measure);
    expect(radius.ok && actionablePlans(radius.plans)).toHaveLength(1);
    expect(
      planAlignment(
        { ...p, symmetry: { ...p.symmetry, enabled: false } },
        sel,
        'canvas',
        'symmetry-center',
        measure,
      ),
    ).toEqual({ ok: false, reason: 'needSymmetry' });
    expect(
      planAlignment(
        { ...p, symmetry: { ...p.symmetry, mirror: true } },
        sel,
        'canvas',
        'symmetry-sector',
        measure,
      ),
    ).toEqual({ ok: false, reason: 'mirrorBlocked' });
    expect(
      planAlignment(p, { selected: [a, b], key: a }, 'canvas', 'distribute-x', measure),
    ).toEqual({ ok: false, reason: 'needThree' });
    const keyR = planAlignment(p, sel, 'canvas', 'symmetry-radius', measure);
    expect(keyR.ok && keyR.plans.find((x) => x.id === c.id)).toEqual({ id: c.id, dx: 0, dy: 200 });
  });
});
