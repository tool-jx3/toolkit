/**
 * UI 框素材產生器：畫框（規格 3.3～3.7）——用 node-canvas 真的畫出來量像素：透明邊、有窗的框窗裡完全透明、
 * 框底的不透明度、滑過的光暈、按下往下沉、停用變淡、光暈不超出 PNG 的範圍、長文字的縮小與截斷；
 * 每個預設的每一張素材都畫得出來。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeCanvas } from '../../src/core/image';
import { CHOICE_PAD, novelLayout, padRect, SYS_PAD } from '../../src/tools/ui-frame/layout';
import { type DocState, initialState, PRESETS } from '../../src/tools/ui-frame/model';
import { type PartDef, partsOf, renderPart } from '../../src/tools/ui-frame/parts';
import { fitLine, labelInset, ornamentExtent } from '../../src/tools/ui-frame/render';
import { drawStage, hitAt } from '../../src/tools/ui-frame/stage';
import { nodeCanvas } from '../helpers/nodeCanvas';

const canvasLib = await nodeCanvas();

type Img = { data: Uint8ClampedArray; width: number; height: number };

function draw(doc: DocState, id: string): Img {
  const part = partsOf(doc).find((p) => p.id === id) as PartDef;
  const c = renderPart(part, doc.resolution, makeCanvas);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { data: img.data, width: c.width, height: c.height };
}

const alphaAt = (img: Img, x: number, y: number) =>
  img.data[(Math.round(y) * img.width + Math.round(x)) * 4 + 3];

const doc = (patch: Partial<DocState> = {}, design: Partial<DocState['design']> = {}) => {
  const s = initialState();
  return { ...s, resolution: 1920, ...patch, design: { ...s.design, ...design } } as DocState;
};

describe.runIf(!!canvasLib)('畫框（node-canvas）', () => {
  beforeAll(() => {
    expect(canvasLib).not.toBeNull();
  });

  it('PNG 的四個角是透明邊；框底的不透明度照設定', () => {
    for (const op of [100, 60]) {
      const img = draw(doc({}, { bgOpacity: op, texture: 'none', innerOffset: 0 }), 'message');
      for (const [x, y] of [
        [0, 0],
        [img.width - 1, 0],
        [0, img.height - 1],
        [img.width - 1, img.height - 1],
      ])
        expect(alphaAt(img, x, y)).toBe(0);
      const a = alphaAt(img, img.width / 2, img.height / 2);
      expect(Math.abs(a - (op / 100) * 255)).toBeLessThanOrEqual(3);
    }
  });

  it('畫面外框、角色框：中間的窗完全透明（陰影也不進窗裡），框的部分不透明', () => {
    const s = doc({ mode: 'trpg' });
    const screen = draw(s, 'trpg:screen');
    expect([screen.width, screen.height]).toEqual([1920, 1080]);
    for (const [x, y] of [
      [960, 540],
      [80, 80],
      [1840, 1000],
      [960, 56],
    ])
      expect(alphaAt(screen, x, y)).toBe(0);
    expect(alphaAt(screen, 30, 540)).toBeGreaterThan(200);
    const portrait = draw(s, 'trpg:portrait');
    /* 窗：框的左上 (24, 24) 往內 24、寬 312、高 420 */
    expect(alphaAt(portrait, 24 + 24 + 156, 24 + 24 + 210)).toBe(0);
    expect(alphaAt(portrait, 24 + 24 + 156, 24 + 24 + 3)).toBe(0);
    expect(alphaAt(portrait, 24 + 180, 24 + 500)).toBeGreaterThan(200);
  });

  it('滑過：框外一圈光暈；按下：往下沉；停用：變淡', () => {
    const s = doc({}, { hoverGlow: 20, activeShift: 4 });
    const normal = draw(s, 'choice:normal');
    const hover = draw(s, 'choice:hover');
    const active = draw(s, 'choice:active');
    const disabled = draw(s, 'choice:disabled');
    const cx = normal.width / 2;
    /* 按鈕上緣（y＝透明邊 24）的上方 8 px */
    expect(alphaAt(hover, cx, 24 - 8)).toBeGreaterThan(alphaAt(normal, cx, 24 - 8) + 10);
    const topEdge = (img: Img) => {
      for (let y = 0; y < img.height; y++) if (alphaAt(img, cx, y) > 200) return y;
      return -1;
    };
    expect(topEdge(active) - topEdge(normal)).toBe(4);
    expect(alphaAt(disabled, cx, 24 + 34)).toBeLessThan(alphaAt(normal, cx, 24 + 34) * 0.85);
  });

  it('光暈與陰影不超出 PNG 的範圍：預覽裡滑過、按下時，按鈕的 PNG 範圍以外一點都沒變', () => {
    const env = {
      scene: 'checker' as const,
      bgImage: null,
      charImage: null,
      samplePortrait: false,
      hover: null as string | null,
      pressed: null as string | null,
      scale: 1,
    };
    const s = doc({}, { hoverGlow: 24, activeShift: 5 });
    const shot = (hover: string | null, pressed: string | null) => {
      const c = makeCanvas(1920, 1080);
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const hits = drawStage(ctx, s, { ...env, hover, pressed });
      return { data: ctx.getImageData(0, 0, 1920, 1080).data, hits };
    };
    const base = shot(null, null);
    const L = novelLayout(s.design);
    for (const [id, rect, pad] of [
      ['sys:load', L.sys[1], SYS_PAD],
      ['choice:1', L.choices[1], CHOICE_PAD],
    ] as const) {
      const box = padRect(rect, pad);
      for (const [hover, pressed] of [
        [id, null],
        [id, id],
      ] as const) {
        const now = shot(hover, pressed);
        let changedInside = 0;
        let changedOutside = 0;
        for (let y = box.y - 30; y < box.y + box.h + 30; y++)
          for (let x = box.x - 30; x < box.x + box.w + 30; x++) {
            const k = (y * 1920 + x) * 4;
            const diff =
              base.data[k] !== now.data[k] ||
              base.data[k + 1] !== now.data[k + 1] ||
              base.data[k + 2] !== now.data[k + 2];
            const inside = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
            if (diff && inside) changedInside++;
            if (diff && !inside) changedOutside++;
          }
        expect(changedInside, `${id} ${pressed ? '按下' : '滑過'}`).toBeGreaterThan(0);
        expect(changedOutside, `${id} ${pressed ? '按下' : '滑過'}`).toBe(0);
      }
    }
  });

  it('PNG 的光暈也在範圍內：系統按鈕滑過時，四邊最外一圈幾乎透明', () => {
    const s = doc({}, { hoverGlow: 24 });
    const hover = draw(s, 'sys:save:hover');
    let edge = 0;
    for (let x = 0; x < hover.width; x++)
      edge = Math.max(edge, alphaAt(hover, x, 0), alphaAt(hover, x, hover.height - 1));
    for (let y = 0; y < hover.height; y++)
      edge = Math.max(edge, alphaAt(hover, 0, y), alphaAt(hover, hover.width - 1, y));
    expect(edge).toBeLessThan(80);
  });

  it('每個預設、兩種解析度、兩種用途的每一張素材都畫得出來，而且不是空白', () => {
    for (const p of PRESETS)
      for (const res of [1920, 1280] as const)
        for (const mode of ['novel', 'trpg'] as const) {
          const s = { ...doc({ mode, resolution: res }), design: p.design };
          const all = partsOf({ ...s, texts: { ...s.texts, bake: true } });
          for (const part of all) {
            const c = renderPart(part, res, makeCanvas);
            expect([c.width, c.height]).toEqual([part.width, part.height]);
            const ctx = c.getContext('2d') as CanvasRenderingContext2D;
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let opaque = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
            expect(opaque, `${p.id} ${res} ${part.file}`).toBeGreaterThan(0);
          }
        }
  });

  it('長的文字：先縮小字級（最小 70%），還放不下就截斷加「…」，不會壓扁', () => {
    /* 每個字的寬＝字級 */
    const measure = (t: string, size: number) => Array.from(t).length * size;
    expect(fitLine(measure, '短', 100, 20)).toEqual({ text: '短', size: 20 });
    /* 6 字 × 20 = 120 > 100 → 縮成 16 */
    expect(fitLine(measure, '六個字的名字', 100, 20)).toEqual({ text: '六個字的名字', size: 16 });
    /* 縮到 14（70%）還放不下 → 截斷 */
    const long = fitLine(measure, '一二三四五六七八九十', 100, 20);
    expect(long.size).toBe(14);
    expect(long.text.endsWith('…')).toBe(true);
    expect(measure(long.text, long.size)).toBeLessThanOrEqual(100);
    expect(long.text).toBe('一二三四五六…');
  });

  it('按鈕的字左右讓出裝飾：沒有裝飾時 16，裝飾越大讓越多', () => {
    const d = PRESETS[0].design;
    expect(labelInset({ ...d, ornament: 'none' }, 640, 68)).toBe(16);
    const small = labelInset({ ...d, ornament: 'classic', ornamentScale: 60 }, 640, 68);
    const big = labelInset({ ...d, ornament: 'classic', ornamentScale: 160 }, 640, 68);
    expect(big).toBeGreaterThan(small);
    expect(big).toBe(
      Math.max(16, Math.ceil(ornamentExtent({ ...d, ornamentScale: 160 }, 640, 68)) + 8),
    );
  });

  it('預覽畫面：文字冒險回傳 3 個選項＋8 個系統按鈕的範圍；TRPG 沒有', () => {
    const c = makeCanvas(1920, 1080);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const env = {
      scene: 'checker' as const,
      bgImage: null,
      charImage: null,
      samplePortrait: false,
      hover: null,
      pressed: null,
      scale: 1,
    };
    const hits = drawStage(ctx, doc(), env);
    expect(hits.map((h) => h.id)).toEqual([
      'choice:0',
      'choice:1',
      'choice:2',
      'sys:save',
      'sys:load',
      'sys:auto',
      'sys:skip',
      'sys:log',
      'sys:config',
      'sys:title',
      'sys:close',
    ]);
    expect(hitAt(hits, 960, 234)).toBe('choice:0');
    expect(hitAt(hits, 10, 10)).toBeNull();
    expect(drawStage(ctx, doc({ mode: 'trpg' }), env)).toEqual([]);
    for (const scene of ['study', 'classroom', 'neon', 'shrine', 'field'] as const)
      expect(() => drawStage(ctx, doc(), { ...env, scene, samplePortrait: true })).not.toThrow();
  });
});
