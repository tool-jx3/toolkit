/**
 * UI 框素材產生器：畫框（規格 3.3～3.7）——用 node-canvas 真的畫出來量像素：透明邊、有窗的框窗裡完全透明、
 * 框底的不透明度、滑過的光暈、按下往下沉、停用變淡；每個預設的每一張素材都畫得出來。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { makeCanvas } from '../../src/core/image';
import { type DocState, initialState, PRESETS } from '../../src/tools/ui-frame/model';
import { type PartDef, partsOf, renderPart } from '../../src/tools/ui-frame/parts';
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
    /* 按鈕上緣（y＝32）的上方 8 px */
    expect(alphaAt(hover, cx, 32 - 8)).toBeGreaterThan(alphaAt(normal, cx, 32 - 8) + 10);
    const topEdge = (img: Img) => {
      for (let y = 0; y < img.height; y++) if (alphaAt(img, cx, y) > 200) return y;
      return -1;
    };
    expect(topEdge(active) - topEdge(normal)).toBe(4);
    expect(alphaAt(disabled, cx, 32 + 34)).toBeLessThan(alphaAt(normal, cx, 32 + 34) * 0.7);
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
