import { describe, expect, it } from 'vitest';
import { decodeState, encodeState } from '../src/core/serialize';
import { MAX_TOTAL_PIXELS, getTarget, totalPixels, validate } from '../src/core/targets';
import { DEFAULT_PARAMS } from '../src/core/templates';
import type { RenderParams } from '../src/core/types';

const AXES = { decoId: 'outline-gold', themeId: 'rainbow-gold', effectId: 'radiate' };

/** 共有URLは第三者が作れる入力なので、壊れた値で落ちないことを担保する */
function roundTrip(params: RenderParams) {
  const hash = encodeState({ params, targetId: 'ccfolia-cutin', axes: AXES });
  return decodeState(hash);
}

describe('共有URLの復元', () => {
  it('往復して同じ値に戻る', () => {
    const back = roundTrip(DEFAULT_PARAMS);
    expect(back).not.toBeNull();
    expect(back!.params.canvas).toEqual(DEFAULT_PARAMS.canvas);
    expect(back!.params.text.lines).toEqual(DEFAULT_PARAMS.text.lines);
    expect(back!.params.frameCount).toBe(DEFAULT_PARAMS.frameCount);
    expect(back!.targetId).toBe('ccfolia-cutin');
    expect(back!.axes).toEqual(AXES);
  });

  it('壊れた文字列は null になる', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#')).toBeNull();
    expect(decodeState('#こわれたデータ')).toBeNull();
    expect(decodeState('#' + 'A'.repeat(9000))).toBeNull();
  });

  it('メモリを食い潰す組み合わせはコマ数が抑えられる', () => {
    const huge = { ...DEFAULT_PARAMS, canvas: { w: 1600, h: 1600 }, frameCount: 60 };
    const back = roundTrip(huge)!;
    expect(totalPixels(back.params)).toBeLessThanOrEqual(MAX_TOTAL_PIXELS);
  });

  it('範囲外の数値はクランプされる', () => {
    const bad = {
      ...DEFAULT_PARAMS,
      canvas: { w: 99999, h: -5 },
      fps: 1000,
      seed: Number.NaN,
      contentScale: 12,
    } as unknown as RenderParams;
    const p = roundTrip(bad)!.params;
    expect(p.canvas.w).toBe(1600);
    expect(p.canvas.h).toBe(64);
    expect(p.fps).toBe(30);
    expect(Number.isFinite(p.seed)).toBe(true);
    expect(p.contentScale).toBe(1);
  });

  it('文字列でない行や過剰な行数は落とされる', () => {
    const bad = {
      ...DEFAULT_PARAMS,
      // 長すぎる共有URL自体は別に弾かれるので、上限に収まる範囲で行数と行長を試す
      text: { ...DEFAULT_PARAMS.text, lines: Array(20).fill('a'.repeat(150)) },
    };
    const p = roundTrip(bad as RenderParams)!.params;
    expect(p.text.lines.length).toBeLessThanOrEqual(8);
    expect(p.text.lines[0].length).toBeLessThanOrEqual(100);
  });

  it('layers が配列でなくても復元できる', () => {
    const bad = { ...DEFAULT_PARAMS, layers: 'こわれている' } as unknown as RenderParams;
    expect(roundTrip(bad)!.params.layers).toEqual([]);
  });
});

describe('書き出し前の検証', () => {
  const target = getTarget('ccfolia-cutin');

  it('既定値では error が出ない', () => {
    expect(validate(DEFAULT_PARAMS, target).filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('大きすぎる指定は error になる', () => {
    const huge = { ...DEFAULT_PARAMS, canvas: { w: 1600, h: 1600 }, frameCount: 60 };
    const errors = validate(huge, target).filter((i) => i.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    /* 【TRPG Toolkit 収録時の変更点】
     * 文言は i18n 辞書（tools/cutin/i18n.cutin.js）へ移したので、原文の
     * 一部を含むかではなく、その key が返っているかで判定する。
     * 辞書は index.html が window.T として読み込むもので、Node では
     * 未定義なので t() は key をそのまま返す。 */
    expect(errors.some((e) => e.message === 'issue.tooLarge')).toBe(true);
  });
});
