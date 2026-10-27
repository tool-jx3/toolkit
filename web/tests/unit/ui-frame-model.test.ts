/**
 * UI 框素材產生器：資料模型（規格 docs/refactor/specs/ui-frame.md 1、3.1、3.10）——
 * 數值範圍（原作的滑桿）、預設集（本站自己設計）的值都在範圍內、整理（壞資料改回預設）、文字的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  BUTTON_LANGS,
  CORNER_STYLES,
  CURSOR_SHAPES,
  clampRange,
  FONT_IDS,
  initialState,
  normalizeDesign,
  normalizeState,
  ORNAMENTS,
  PRESETS,
  QUICK_COLORS,
  RANGE_KEYS,
  RANGES,
  SCENES,
  TEXT_MAX,
  TEXTURES,
  tidyText,
} from '../../src/tools/ui-frame/model';
import { S } from '../../src/tools/ui-frame/strings';

describe('數值範圍（3.1，原作的滑桿）', () => {
  it('11 個滑桿的最小、最大、間隔', () => {
    expect(RANGES).toEqual({
      bgOpacity: { min: 40, max: 100, step: 1 },
      cornerSize: { min: 0, max: 42, step: 1 },
      borderWidth: { min: 1, max: 8, step: 0.5 },
      innerOffset: { min: 0, max: 16, step: 1 },
      ornamentScale: { min: 50, max: 160, step: 1 },
      textureAlpha: { min: 0, max: 50, step: 1 },
      msgW: { min: 1100, max: 1840, step: 10 },
      msgH: { min: 200, max: 380, step: 4 },
      choiceW: { min: 420, max: 960, step: 10 },
      hoverGlow: { min: 4, max: 24, step: 1 },
      activeShift: { min: 1, max: 5, step: 1 },
    });
  });

  it('文字欄的字數上限（原作）', () => {
    expect(TEXT_MAX).toEqual({
      charName: 60,
      line: 500,
      choice1: 100,
      choice2: 100,
      choice3: 100,
      portraitName: 60,
      status1: 60,
      status2: 60,
      status3: 60,
      dice: 80,
      board: 500,
    });
  });

  it('選項的種類：外框 4、裝飾 7、質感 6、字型 6、游標 5、背景 6', () => {
    expect(CORNER_STYLES).toHaveLength(4);
    expect(ORNAMENTS).toHaveLength(7);
    expect(TEXTURES).toHaveLength(6);
    expect(FONT_IDS).toHaveLength(6);
    expect(CURSOR_SHAPES).toHaveLength(5);
    expect(SCENES).toHaveLength(6);
    expect(BUTTON_LANGS).toEqual(['en', 'zh']);
  });

  it('夾範圍並對齊間隔；看不懂用 fallback', () => {
    expect(clampRange('borderWidth', 2.3, 1)).toBe(2.5);
    expect(clampRange('borderWidth', 99, 1)).toBe(8);
    expect(clampRange('msgH', 203, 272)).toBe(204);
    expect(clampRange('msgW', 1000, 1560)).toBe(1100);
    expect(clampRange('msgW', '1234', 1560)).toBe(1230);
    expect(clampRange('hoverGlow', 'abc', 14)).toBe(14);
    expect(clampRange('activeShift', Number.NaN, 2)).toBe(2);
  });
});

describe('預設集（3.10，本站自己設計）', () => {
  it('6 組、id 與名稱不重複，每組都有名稱與說明', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(5);
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = ids.map((id) => S.presets[id].name);
    expect(new Set(names).size).toBe(names.length);
    for (const id of ids) expect(S.presets[id].desc).toBeTruthy();
  });

  it('每組的值都合法（整理之後不變）、背景在清單裡', () => {
    for (const p of PRESETS) {
      expect(normalizeDesign(p.design)).toEqual(p.design);
      for (const k of RANGE_KEYS) {
        expect(p.design[k]).toBeGreaterThanOrEqual(RANGES[k].min);
        expect(p.design[k]).toBeLessThanOrEqual(RANGES[k].max);
      }
      expect(SCENES).toContain(p.scene);
      expect(p.design.keyColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('涵蓋深色與淺色、像素字型、和風的質感', () => {
    expect(new Set(PRESETS.map((p) => p.design.polarity))).toEqual(new Set(['dark', 'light']));
    expect(PRESETS.some((p) => p.design.font === 'pixel')).toBe(true);
    expect(PRESETS.some((p) => p.design.texture === 'washi')).toBe(true);
  });

  it('推薦主色是小寫 #rrggbb、不重複', () => {
    for (const c of QUICK_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(QUICK_COLORS).size).toBe(QUICK_COLORS.length);
  });
});

describe('初始值與整理', () => {
  it('第一次開啟：第一個預設、文字冒險、1280 × 720、文字不畫進 PNG', () => {
    const s = initialState();
    expect(s.mode).toBe('novel');
    expect(s.resolution).toBe(1280);
    expect(s.design).toEqual(PRESETS[0].design);
    expect(s.base).toMatchObject({ kind: 'preset', id: PRESETS[0].id, name: '舊宅調查' });
    expect(s.texts.bake).toBe(false);
  });

  it('壞資料改回預設、超出範圍夾回、色碼轉小寫', () => {
    const s = normalizeState({
      mode: 'movie',
      resolution: 800,
      design: {
        keyColor: '#ABC',
        polarity: 'grey',
        corner: 'round',
        cornerSize: 99,
        borderWidth: '3.2',
        texture: 'stone',
      },
      texts: { charName: 'A\nB', line: 'x\r\ny', bake: 'yes' },
      base: { kind: 'mine', id: 'p1', name: '我的', design: null },
    });
    expect(s.mode).toBe('novel');
    expect(s.resolution).toBe(1280);
    expect(s.design.keyColor).toBe('#aabbcc');
    expect(s.design.polarity).toBe(PRESETS[0].design.polarity);
    expect(s.design.corner).toBe('round');
    expect(s.design.cornerSize).toBe(42);
    expect(s.design.borderWidth).toBe(3);
    expect(s.design.texture).toBe(PRESETS[0].design.texture);
    expect(s.texts.charName).toBe('A B');
    expect(s.texts.line).toBe('x\ny');
    expect(s.texts.bake).toBe(false);
    expect(s.base).toMatchObject({ kind: 'mine', id: 'p1', name: '我的' });
    expect(s.base.design).toEqual(s.design);
    expect(normalizeState(null)).toEqual(initialState());
  });

  it('文字：單行欄位換行變空白、超過上限截掉（以字計）', () => {
    expect(tidyText('choice1', '一\n二')).toBe('一 二');
    expect(tidyText('line', '一\n二')).toBe('一\n二');
    expect(Array.from(tidyText('charName', '😀'.repeat(70)))).toHaveLength(60);
    expect(tidyText('dice', 5)).toBe('');
  });
});
