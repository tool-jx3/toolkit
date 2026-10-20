/**
 * DeckPainter（F152）：沒有畫布濾鏡（`ctx.filter`）的瀏覽器上，模糊改用交叉溶接。
 * 判斷「支援」要在寫 filter 之前：在沒有 filter 屬性的物件上寫 `filter = 'none'` 會替它加上同名自有屬性，判斷就永遠為真。
 */
import { describe, expect, it } from 'vitest';
import { DeckPainter, type DeckScene } from '@/tools/bg-motion/deckRender';

interface Call {
  op: string;
  args: unknown[];
  alpha: number;
  composite: string;
}

/** 記錄呼叫的假畫布環境；withFilter＝false 時沒有 filter 屬性（模擬不支援的瀏覽器） */
function fakeCanvasFactory(withFilter: boolean) {
  const calls: Call[] = [];
  const made: { ctx: Record<string, unknown> }[] = [];
  const create = (w: number, h: number) => {
    const state: Record<string, unknown> = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    };
    if (withFilter) state.filter = 'none';
    const stack: Record<string, unknown>[] = [];
    const rec =
      (op: string) =>
      (...args: unknown[]) => {
        calls.push({
          op,
          args,
          alpha: state.globalAlpha as number,
          composite: state.globalCompositeOperation as string,
        });
      };
    const ctx = new Proxy(state, {
      get(t, k: string) {
        if (k === 'canvas') return canvas;
        if (k === 'save') return () => stack.push({ ...t });
        if (k === 'restore')
          return () => {
            const p = stack.pop();
            if (p) for (const key of Object.keys(p)) t[key] = p[key];
          };
        if (k in t) return t[k];
        if (
          [
            'drawImage',
            'fillRect',
            'clearRect',
            'setTransform',
            'beginPath',
            'rect',
            'arc',
            'ellipse',
            'clip',
          ].includes(k)
        )
          return rec(k);
        return undefined;
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
      has(t, k) {
        return k in t || k === 'canvas';
      },
    });
    const canvas = { width: w, height: h, getContext: () => ctx };
    made.push({ ctx: state });
    return canvas as unknown as HTMLCanvasElement;
  };
  return { create, calls, made };
}

const bitmap = (w = 8, h = 8) => ({ width: w, height: h }) as unknown as ImageBitmap;

const scene = (kind: 'blur' | 'fade'): DeckScene => ({
  images: [bitmap(), bitmap()],
  segs: [
    { type: 'hold', i: 0, start: 0, dur: 1 },
    { type: 'trans', i: 0, j: 1, kind, start: 1, dur: 1 },
    { type: 'hold', i: 1, start: 2, dur: 1 },
  ],
  fit: 'contain',
  bg: '#ffffff',
  transparent: false,
  easing: 'linear',
});

function paintAt(withFilter: boolean, kind: 'blur' | 'fade', t: number) {
  const f = fakeCanvasFactory(withFilter);
  const painter = new DeckPainter(f.create);
  const main = f.create(8, 8);
  f.calls.length = 0;
  painter.paint(main.getContext('2d') as never, scene(kind), 8, 8, t);
  return f;
}

describe('模糊在沒有畫布濾鏡的瀏覽器上改用交叉溶接（F152）', () => {
  it('支援濾鏡：模糊用放大範圍的 5 參數 drawImage（略為放大）', () => {
    const f = paintAt(true, 'blur', 1.5);
    const draws = f.calls.filter((c) => c.op === 'drawImage');
    expect(draws.some((c) => c.args.length === 9 || c.args.length === 5)).toBe(true);
  });

  it('不支援濾鏡：畫的和交叉溶接一樣（A 以 1 − p、B 以 p 相加，都是整個畫面的 3 參數 drawImage）', () => {
    const blur = paintAt(false, 'blur', 1.5);
    const fade = paintAt(false, 'fade', 1.5);
    const sig = (calls: Call[]) =>
      calls.filter((c) => c.op === 'drawImage').map((c) => [c.args.length, c.alpha, c.composite]);
    expect(sig(blur.calls)).toEqual(sig(fade.calls));
    /* 切換的兩層（不透明度不是 1 的那兩次） */
    expect(sig(blur.calls).filter((c) => c[1] !== 1)).toEqual([
      [3, 0.5, 'source-over'],
      [3, 0.5, 'lighter'],
    ]);
  });

  it('不支援濾鏡：暫存畫布的環境不會被加上 filter 屬性', () => {
    const f = paintAt(false, 'blur', 1.5);
    for (const m of f.made) expect('filter' in m.ctx).toBe(false);
  });
});
