/**
 * 圖片切換的 25 種效果在 p＝0、0.5、1（及幾個中間值）的畫法（規格 3.11.6、F141～F155）：
 * `transitionOps` 回傳「畫哪一張、在哪裡、不透明度、相加與否、裁剪範圍、模糊半徑、馬賽克格子」的清單。
 */
import { describe, expect, it } from 'vitest';
import { RANDOM_POOL, TRANS_KINDS, type TransKind } from '@/tools/bg-motion/deck';
import { type FxOp, type ImageOp, transitionOps } from '@/tools/bg-motion/switchFx';

const W = 800;
const H = 450;
const R = Math.hypot(W, H) / 2;

const ops = (k: TransKind, p: number, canFilter = true) => transitionOps(k, p, W, H, canFilter);
const images = (list: FxOp[]) => list.filter((o): o is ImageOp => o.type === 'image');
const rect = (o: ImageOp) => o.rect ?? { x: 0, y: 0, w: W, h: H };
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('不切換（對話框縮圖用）', () => {
  it('前半 A、後半 B', () => {
    expect(images(ops('cut', 0.2)).map((o) => o.src)).toEqual(['A']);
    expect(images(ops('cut', 0.5)).map((o) => o.src)).toEqual(['B']);
  });
});

describe('交叉溶接（F142）', () => {
  it('A 的不透明度 1 − p，B 以相加疊上、不透明度 p', () => {
    for (const p of [0, 0.25, 0.5, 1]) {
      const [a, b] = images(ops('fade', p));
      expect([a.src, b.src]).toEqual(['A', 'B']);
      close(a.alpha, 1 - p);
      close(b.alpha, p);
      expect([a.add, b.add]).toEqual([false, true]);
    }
  });
});

describe('經過黑色、經過白色（F143）', () => {
  it('p < 0.5 畫 A，否則畫 B；顏色層的不透明度 1 − |p − 0.5| × 2', () => {
    const at = (kind: TransKind, p: number) => {
      const list = ops(kind, p);
      return { img: images(list)[0].src, fill: list.find((o) => o.type === 'fill') };
    };
    expect(at('dipblack', 0)).toMatchObject({ img: 'A', fill: { color: '#000000' } });
    close((at('dipblack', 0).fill as { alpha: number }).alpha, 0);
    expect(at('dipblack', 0.25).img).toBe('A');
    close((at('dipblack', 0.25).fill as { alpha: number }).alpha, 0.5);
    expect(at('dipblack', 0.5).img).toBe('B');
    close((at('dipblack', 0.5).fill as { alpha: number }).alpha, 1);
    expect(at('dipblack', 0.75).img).toBe('B');
    close((at('dipblack', 0.75).fill as { alpha: number }).alpha, 0.5);
    expect(at('dipblack', 1).img).toBe('B');
    close((at('dipblack', 1).fill as { alpha: number }).alpha, 0);
    expect(at('dipwhite', 0.5).fill).toMatchObject({ color: '#ffffff' });
  });
});

describe('滑入（F144）', () => {
  const r = (kind: TransKind, p: number) => images(ops(kind, p)).map(rect);
  it('從右：A 往左移 p × W，B 從 (1 − p) × W 進來', () => {
    for (const p of [0, 0.5, 1]) {
      const [a, b] = r('slideR', p);
      close(a.x, -p * W);
      close(a.y, 0);
      close(b.x, (1 - p) * W);
      close(b.y, 0);
      expect([a.w, a.h, b.w, b.h]).toEqual([W, H, W, H]);
    }
  });
  it('從左、從下、從上', () => {
    let [a, b] = r('slideL', 0.5);
    close(a.x, 0.5 * W);
    close(b.x, -0.5 * W);
    [a, b] = r('slideB', 0.25);
    close(a.y, -0.25 * H);
    close(b.y, 0.75 * H);
    close(a.x, 0);
    [a, b] = r('slideT', 0.25);
    close(a.y, 0.25 * H);
    close(b.y, -0.75 * H);
  });
});

describe('蓋過（F145）', () => {
  it('A 不動；B 從指定方向滑進來', () => {
    const list = images(ops('coverR', 0.5));
    expect(list[0].src).toBe('A');
    expect(list[0].rect).toBeNull();
    close(rect(list[1]).x, 0.5 * W);
    close(rect(images(ops('coverL', 0.5))[1]).x, -0.5 * W);
    close(rect(images(ops('coverB', 0.25))[1]).y, 0.75 * H);
    close(rect(images(ops('coverT', 0.25))[1]).y, -0.75 * H);
    close(rect(images(ops('coverR', 1))[1]).x, 0);
    close(rect(images(ops('coverR', 0))[1]).x, W);
  });
});

describe('擦除（F146）', () => {
  const clipRects = (kind: TransKind, p: number) => {
    const b = images(ops(kind, p))[1];
    expect(images(ops(kind, p))[0]).toMatchObject({ src: 'A', rect: null, clip: null });
    expect(b.rect).toBeNull();
    return (b.clip as { rects: { x: number; y: number; w: number; h: number }[] }).rects;
  };
  it('從右、左、下、上露出 p 的比例', () => {
    let [c] = clipRects('wipeR', 0.25);
    expect(c).toEqual({ x: 0.75 * W, y: 0, w: 0.25 * W, h: H });
    [c] = clipRects('wipeL', 0.25);
    expect(c).toEqual({ x: 0, y: 0, w: 0.25 * W, h: H });
    [c] = clipRects('wipeB', 0.5);
    expect(c).toEqual({ x: 0, y: 0.5 * H, w: W, h: 0.5 * H });
    [c] = clipRects('wipeT', 0.5);
    expect(c).toEqual({ x: 0, y: 0, w: W, h: 0.5 * H });
  });
  it('p＝0 沒有露出、p＝1 整個畫面', () => {
    const [c0] = clipRects('wipeR', 0);
    expect(c0.w).toBe(0);
    expect(clipRects('wipeR', 1)[0]).toEqual({ x: 0, y: 0, w: W, h: H });
  });
});

describe('放大、縮小（F147、F148）', () => {
  it('放大：A 1 − p、倍率 1 + 0.4p；B p、倍率 0.75 + 0.25p；B 相加', () => {
    for (const p of [0, 0.5, 1]) {
      const [a, b] = images(ops('zoomIn', p));
      close(a.alpha, 1 - p);
      close(b.alpha, p);
      expect(b.add).toBe(true);
      const sa = 1 + 0.4 * p;
      const sb = 0.75 + 0.25 * p;
      expect(rect(a)).toEqual({ x: W / 2 - (W * sa) / 2, y: H / 2 - (H * sa) / 2, w: W * sa, h: H * sa });
      expect(rect(b)).toEqual({ x: W / 2 - (W * sb) / 2, y: H / 2 - (H * sb) / 2, w: W * sb, h: H * sb });
    }
  });
  it('縮小：A 倍率 1 − 0.3p；B 倍率 1.3 − 0.3p', () => {
    const [a, b] = images(ops('zoomOut', 1));
    close(rect(a).w, W * 0.7);
    close(rect(b).w, W);
    const [a0, b0] = images(ops('zoomOut', 0));
    close(rect(a0).w, W);
    close(rect(b0).w, W * 1.3);
  });
});

describe('圓形展開、圓形收合（F149、F150）', () => {
  const circle = (kind: TransKind, p: number) => {
    const list = images(ops(kind, p));
    const over = list[1];
    return {
      under: list[0].src,
      over: over.src,
      c: (over.clip as { circle: { x: number; y: number; r: number } }).circle,
    };
  };
  it('展開：A 在底，B 在半徑 pR 的圓裡', () => {
    for (const p of [0, 0.5, 1]) {
      const { under, over, c } = circle('circle', p);
      expect([under, over]).toEqual(['A', 'B']);
      close(c.x, W / 2);
      close(c.y, H / 2);
      close(c.r, R * p);
    }
  });
  it('收合：B 在底，A 在半徑 (1 − p)R 的圓裡', () => {
    for (const p of [0, 0.5, 1]) {
      const { under, over, c } = circle('circleClose', p);
      expect([under, over]).toEqual(['B', 'A']);
      close(c.r, R * (1 - p));
    }
  });
});

describe('百葉窗（F151）', () => {
  it('直：8 條，每條左端起寬 (W/8) × p', () => {
    const b = images(ops('blindsV', 0.5))[1];
    const rects = (b.clip as { rects: { x: number; y: number; w: number; h: number }[] }).rects;
    expect(rects).toHaveLength(8);
    rects.forEach((r, k) => {
      close(r.x, (k * W) / 8);
      close(r.w, (W / 8) * 0.5);
      expect([r.y, r.h]).toEqual([0, H]);
    });
  });
  it('橫：8 條，每條上端起高 (H/8) × p', () => {
    const b = images(ops('blindsH', 0.25))[1];
    const rects = (b.clip as { rects: { x: number; y: number; w: number; h: number }[] }).rects;
    expect(rects).toHaveLength(8);
    rects.forEach((r, k) => {
      close(r.y, (k * H) / 8);
      close(r.h, (H / 8) * 0.25);
      expect([r.x, r.w]).toEqual([0, W]);
    });
  });
});

describe('模糊（F152）', () => {
  it('s ＝ W ÷ 800 × 24；A 模糊 s·p、B 模糊 s·(1 − p)，往外多畫 2 × 半徑', () => {
    const s = (W / 800) * 24;
    for (const p of [0, 0.5, 1]) {
      const [a, b] = images(ops('blur', p));
      close(a.blur ?? -1, s * p);
      close(b.blur ?? -1, s * (1 - p));
      close(a.alpha, 1 - p);
      close(b.alpha, p);
      expect(b.add).toBe(true);
      const ma = (a.blur ?? 0) * 2;
      const ra = rect(a);
      close(ra.x, -ma);
      close(ra.y, -ma);
      close(ra.w, W + ma * 2);
      close(ra.h, H + ma * 2);
    }
  });
  it('不支援畫布濾鏡時改用交叉溶接', () => {
    expect(ops('blur', 0.4, false)).toEqual(ops('fade', 0.4));
  });
});

describe('馬賽克（F153）', () => {
  it('方塊邊長 round(1 + f × max(8, W/18))；p < 0.5 取 A，否則取 B', () => {
    const cell = (p: number) => {
      const [o] = images(ops('pixelate', p));
      return [o.src, o.mosaic] as const;
    };
    expect(cell(0)).toEqual(['A', 1]);
    expect(cell(0.25)).toEqual(['A', Math.round(1 + 0.5 * Math.max(8, W / 18))]);
    expect(cell(0.5)).toEqual(['B', Math.round(1 + Math.max(8, W / 18))]);
    expect(cell(0.75)).toEqual(['B', Math.round(1 + 0.5 * Math.max(8, W / 18))]);
    expect(cell(1)).toEqual(['B', 1]);
  });
  it('畫面很小時方塊至少 8 px（max(8, W/18)）', () => {
    const [o] = images(transitionOps('pixelate', 0.5, 100, 60));
    expect(o.mosaic).toBe(9);
  });
});

describe('翻牌（F154）', () => {
  it('水平寬度 |1 − 2p|，前半 A、後半 B；寬度 ≤ 0.003 時什麼都不畫', () => {
    const one = (p: number) => ops('flip', p);
    let [o] = images(one(0));
    expect([o.src, rect(o)]).toEqual(['A', { x: 0, y: 0, w: W, h: H }]);
    [o] = images(one(0.25));
    expect([o.src, rect(o)]).toEqual(['A', { x: 200, y: 0, w: 400, h: H }]);
    expect(one(0.5)).toEqual([]);
    expect(one(0.499)).toEqual([]);
    [o] = images(one(0.75));
    expect([o.src, rect(o)]).toEqual(['B', { x: 200, y: 0, w: 400, h: H }]);
    [o] = images(one(1));
    expect([o.src, rect(o)]).toEqual(['B', { x: 0, y: 0, w: W, h: H }]);
  });
});

describe('所有效果', () => {
  it('每個實際效果在 p＝0 畫 A（B 看不到）、p＝1 畫 B（A 看不到）', () => {
    /* 簡單檢查：p＝0 時 A 的不透明度是 1 或有 A 的完整畫面；p＝1 時 B 才是完整畫面 */
    for (const kind of RANDOM_POOL) {
      const first = images(ops(kind, 0));
      expect(first.length, kind).toBeGreaterThan(0);
      expect(first.some((o) => o.src === 'A' && o.alpha === 1), kind).toBe(true);
      const last = images(ops(kind, 1));
      expect(last.some((o) => o.src === 'B' && o.alpha === 1), `${kind} 結尾`).toBe(true);
    }
  });

  it('26 個效果全都有定義，p 在 0～1 之間都不會丟錯', () => {
    for (const kind of TRANS_KINDS) {
      for (let i = 0; i <= 20; i++) {
        const list = ops(kind, i / 20);
        for (const o of list) {
          if (o.type === 'image') {
            expect(Number.isFinite(o.alpha)).toBe(true);
            expect(o.alpha).toBeGreaterThanOrEqual(-1e-12);
            expect(o.alpha).toBeLessThanOrEqual(1 + 1e-12);
          }
        }
      }
    }
  });

  it('「隨機」本身不是可畫的效果（排段時已換成實際的效果）：交叉溶接代替', () => {
    expect(ops('random', 0.3)).toEqual(ops('fade', 0.3));
  });
});
