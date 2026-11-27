/**
 * 角色切入產生器：時間軸（節拍、匯出的取樣時間與格數、閃光、震動、白色剪影）、臉的自動對準、
 * 六種型的圖層在固定時間點的取樣（進場、停留、退場、空白）。
 */
import { describe, expect, it } from 'vitest';
import { type AlphaSource, guessFace, neckOf } from '@/tools/char-cutin/face';
import { defaultDoc } from '@/tools/char-cutin/model';
import {
  BEAT,
  EXPORT_LAST,
  exportTimes,
  flashAlpha,
  frameMs,
  overshoot,
  quake,
  SEGMENTS,
  TAIL_TIME,
  whiteout,
} from '@/tools/char-cutin/motion';
import { compose, H, type Layer, type SceneInput, W } from '@/tools/char-cutin/scenes';

describe('節拍與匯出的取樣', () => {
  it('節拍：0.16 秒撞進定位、1.25～1.45 秒退場、1.6 秒以後空白、每 2.1 秒一輪', () => {
    expect(BEAT).toEqual({ land: 0.16, leave: 1.25, gone: 1.45, blank: 1.6, cycle: 2.1 });
    expect(SEGMENTS.map((s) => [s.label, s.start, +s.end.toFixed(2)])).toEqual([
      ['進場', 0, 0.16],
      ['停留', 0.16, 1.25],
      ['退場', 1.25, 1.45],
      ['空白', 1.45, 2.1],
    ]);
  });

  it('24 fps、速度 1：0～1.49 秒 36 格＋空白（重複 8 格、一次 1 格）；每格 42 ms', () => {
    const loop = exportTimes(1, 24, false);
    expect(loop).toHaveLength(44);
    expect(loop.slice(36)).toEqual(Array(8).fill(TAIL_TIME));
    expect(loop[35]).toBeCloseTo(35 / 24, 9);
    expect(loop[35]).toBeLessThanOrEqual(EXPORT_LAST);
    expect(exportTimes(1, 24, true)).toHaveLength(37);
    expect(frameMs(24)).toBe(42);
    expect(frameMs(15)).toBe(67);
    expect(frameMs(12)).toBe(83);
    expect(frameMs(30)).toBe(33);
  });

  it('降 fps 與速度：15 fps 23＋5、12 fps 18＋4；速度 0.5 時格數變兩倍；影片 30 fps 一次 45＋1', () => {
    expect(exportTimes(1, 15, false)).toHaveLength(23 + 5);
    expect(exportTimes(1, 12, false)).toHaveLength(18 + 4);
    expect(exportTimes(0.5, 24, false)).toHaveLength(72 + 8);
    expect(exportTimes(1.5, 24, true)).toHaveLength(24 + 1);
    expect(exportTimes(1, 30, true)).toHaveLength(45 + 1);
  });

  it('閃光、震動、白色剪影、過衝', () => {
    expect(flashAlpha(0.16, 0.16)).toBe(0);
    expect(flashAlpha(0.22, 0.16)).toBeCloseTo(0.275, 6);
    expect(flashAlpha(0.3, 0.16)).toBe(0);
    expect(quake(0.1, 0.16)).toEqual([0, 0]);
    expect(quake(0.31, 0.16)).toEqual([0, 0]);
    const [x, y] = quake(0.2, 0.16);
    expect(Math.abs(x)).toBeLessThanOrEqual(9);
    expect(Math.abs(y)).toBeLessThanOrEqual(6);
    expect(whiteout(0.05, 0.16, 0.34, true)).toBe(1);
    expect(whiteout(0.25, 0.16, 0.34, true)).toBeCloseTo(0.5, 6);
    expect(whiteout(0.05, 0.12, 0.3, false)).toBe(0);
    expect(whiteout(0.21, 0.12, 0.3, false)).toBeCloseTo(0.5, 6);
    const back = overshoot(1.9);
    expect(back(0)).toBe(0);
    expect(back(1)).toBe(1);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(back))).toBeGreaterThan(1.05);
  });
});

/** 測試用的立繪輪廓：頭（圓）＋脖子＋肩膀以下 */
function bust(
  w: number,
  h: number,
  o: { cx: number; headTop: number; headR: number; neckY: number },
) {
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h) data[(y * w + x) * 4 + 3] = 255;
  };
  const cy = o.headTop + o.headR;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inHead = (x - o.cx) ** 2 + (y - cy) ** 2 <= o.headR ** 2;
      const inNeck = y >= cy && y < o.neckY + 10 && Math.abs(x - o.cx) <= o.headR * 0.35;
      const inBody =
        y >= o.neckY + 10 && Math.abs(x - o.cx) <= Math.min(w / 2, o.headR * 1.6 + (y - o.neckY));
      if (inHead || inNeck || inBody) set(x, y);
    }
  return { width: w, height: h, data } satisfies AlphaSource;
}

describe('臉的自動對準', () => {
  it('胸像：找到脖子，眼睛在頭頂到脖子的 68%，基準長度＝頭頂到脖子 × 2.3', () => {
    const src = bust(200, 500, { cx: 100, headTop: 20, headR: 50, neckY: 140 });
    const f = guessFace(src);
    /* 頭的下半縮到脖子的寬度（35 px）的第一列約在 y＝117：眼睛＝20＋0.68 × 97、基準長度＝2.3 × 97 */
    expect(f.eyeX).toBeCloseTo(50, 0);
    expect(f.eyeY).toBeCloseTo(((20 + 0.68 * 97) / 500) * 100, 0);
    expect(f.headLen).toBeCloseTo((2.3 * 97) / 500, 2);
  });

  it('臉偏右時橫向位置跟著偏', () => {
    const f = guessFace(bust(300, 600, { cx: 210, headTop: 30, headR: 50, neckY: 150 }));
    expect(f.eyeX).toBeCloseTo(70, 0);
  });

  it('找脖子：變窄到 82% 以下後找最窄、又寬到 1.35 倍就停', () => {
    const rows = [10, 40, 60, 60, 45, 30, 20, 22, 40, 80].map((width, y) => ({ y, width }));
    expect(neckOf(rows)).toBe(6);
    expect(neckOf([10, 20, 30, 40].map((width, y) => ({ y, width })))).toBeNull();
  });

  it('沒有脖子：細長的全身圖眼睛在頭頂往下 10%；一般的圖在剩下高度的 45%；整張透明時預設', () => {
    const rect = (w: number, h: number, top: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = top; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = 255;
      return { width: w, height: h, data };
    };
    const tall = guessFace(rect(100, 400, 40));
    expect(tall.eyeY).toBeCloseTo(((40 + 40) / 400) * 100, 1);
    expect(tall.headLen).toBeCloseTo(40 / 0.3 / 400, 6);
    const wide = guessFace(rect(200, 200, 20));
    expect(wide.eyeY).toBeCloseTo(((20 + 180 * 0.45) / 200) * 100, 1);
    expect(wide.headLen).toBe(1);
    expect(guessFace({ width: 10, height: 10, data: new Uint8ClampedArray(400) })).toEqual({
      eyeY: 25,
      eyeX: 50,
      headLen: 1,
    });
  });

  it('透明度 40 以下不算輪廓', () => {
    const src = bust(200, 500, { cx: 100, headTop: 20, headR: 50, neckY: 140 });
    for (let i = 3; i < src.data.length; i += 4) if (src.data[i]) src.data[i] = 40;
    expect(guessFace(src)).toEqual({ eyeY: 25, eyeX: 50, headLen: 1 });
  });
});

/* ---------- 圖層的取樣 ---------- */

const input = (t: number, extra: Partial<SceneInput> = {}): SceneInput => ({
  t,
  main: '#3f7be0',
  base: '#141824',
  right: '#d9485f',
  ink: '#ffffff',
  name: '艾莉絲',
  tag: 'ROUND 01',
  quote: '上吧',
  rivalName: '？？？',
  impactText: ['反', '擊'],
  impact: defaultDoc().styles.impact.impact,
  ...extra,
});

/** 找第一個符合條件的圖層（深度優先） */
function find(layers: readonly Layer[], pred: (l: Layer) => boolean): Layer | undefined {
  for (const l of layers) {
    if (pred(l)) return l;
    if (l.type === 'group') {
      const hit = find(l.children, pred);
      if (hit) return hit;
    }
  }
  return undefined;
}
const all = (layers: readonly Layer[], pred: (l: Layer) => boolean): Layer[] =>
  layers.flatMap((l) => [
    ...(pred(l) ? [l] : []),
    ...(l.type === 'group' ? all(l.children, pred) : []),
  ]);
const figure = (layers: readonly Layer[], who = 'hero') =>
  find(layers, (l) => l.type === 'figure' && l.who === who) as Extract<Layer, { type: 'figure' }>;
const flash = (layers: readonly Layer[]) =>
  layers.find((l) => l.type === 'shape' && l.fill === '#ffffff' && 'box' in l.outline);

describe('六種型的圖層', () => {
  it('空白的時間（1.6 秒以後）什麼都不畫', () => {
    for (const k of ['strike', 'glide', 'gaze', 'lift', 'impact', 'versus'] as const) {
      expect(compose(k, input(BEAT.blank))).toEqual([]);
      expect(compose(k, input(TAIL_TIME))).toEqual([]);
      expect(compose(k, input(0.9)).length).toBeGreaterThan(0);
    }
  });

  it('斬入：主色的塊從左邊 1.2 倍畫面寬外進來、0.16 秒到位；1.45 秒整組往右移出 1.3 倍；撞到時閃光', () => {
    const slab = (t: number) => {
      const s = find(
        compose('strike', input(t)),
        (l) => l.type === 'shape' && l.fill === '#3f7be0',
      );
      return s?.type === 'shape' && 'poly' in s.outline ? s.outline.poly[0][0] : NaN;
    };
    expect(slab(0)).toBeCloseTo(-W * 1.2 + W * 0.02, 6);
    expect(slab(BEAT.land)).toBeCloseTo(W * 0.02, 6);
    const outer = (t: number) =>
      compose('strike', input(t))[0] as Extract<Layer, { type: 'group' }>;
    expect(outer(1.0).at).toEqual([0, 0]);
    expect(outer(BEAT.gone).at?.[0]).toBeCloseTo(W * 1.3, 6);
    /* 立繪：眼睛在窗的 68% 寬、33% 高，臉的基準長度畫成 1.612 倍畫面高；進場時是白色剪影 */
    const f = figure(compose('strike', input(1.0)));
    expect(f.eye[1]).toBeCloseTo(H * 0.33, 6);
    expect(f.reach).toBeCloseTo(H * 1.612, 6);
    expect(figure(compose('strike', input(0.1))).white).toBe(1);
    expect(f.white).toBe(0);
    expect(flash(compose('strike', input(0.2)))).toBeTruthy();
    expect(flash(compose('strike', input(0.5)))).toBeUndefined();
    /* 名字的字級 150、放不下時每次縮 4、最小約 40；寬度上限 0.36 倍畫面寬 */
    const name = find(compose('strike', input(1.0)), (l) => l.type === 'text' && l.role === 'name');
    expect(name).toMatchObject({ size: 150, fit: { width: W * 0.36, min: 40, step: 4 } });
  });

  it('橫掠：0～0.22 秒淡入、立繪從 0.98 倍往左滑到 0.54 倍畫面寬、邊緣淡出；1.25～1.55 秒淡出', () => {
    const f0 = figure(compose('glide', input(0)));
    expect(f0.alpha).toBe(0);
    expect(f0.eye[0]).toBeCloseTo(W * 0.98, 6);
    expect(f0.fade?.x).toEqual([
      [0, 0],
      [0.35, 1],
      [0.9, 1],
      [1, 0],
    ]);
    expect(figure(compose('glide', input(0.5))).alpha).toBeCloseTo(0.82, 6);
    expect(figure(compose('glide', input(BEAT.gone))).eye[0]).toBeCloseTo(W * 0.54, 3);
    expect(figure(compose('glide', input(1.4))).alpha).toBeCloseTo(0.82 * (1 - 0.15 / 0.3), 6);
  });

  it('眼部特寫：帶子從 0 張開到 0.24 倍畫面高；退完就沒有；特寫 1.89 倍畫面寬起跳、慢慢放大', () => {
    expect(compose('gaze', input(0))).toEqual([]);
    const band = (t: number) => {
      const s = find(compose('gaze', input(t)), (l) => l.type === 'shape' && l.fill === '#141824');
      return s?.type === 'shape' && 'box' in s.outline ? s.outline.box[3] - 28 : NaN;
    };
    expect(band(0.5)).toBeCloseTo(H * 0.24, 6);
    expect(compose('gaze', input(BEAT.gone))).toEqual([]);
    const reach = (t: number) => figure(compose('gaze', input(t))).reach;
    expect(reach(BEAT.land)).toBeCloseTo(((W * 1.55) / 0.82) * 1.06, 6);
    expect(reach(1.0)).toBeGreaterThan(reach(0.5));
  });

  it('升起：半圓從 0 長到 0.6 倍畫面高；立繪從下面彈上來（中途超過定位）；名牌從右邊滑進來', () => {
    const arc = (t: number) => {
      const s = find(compose('lift', input(t)), (l) => l.type === 'shape' && 'arc' in l.outline);
      return s?.type === 'shape' && 'arc' in s.outline ? s.outline.arc.r : 0;
    };
    expect(arc(0)).toBe(0);
    expect(arc(0.5)).toBeCloseTo(H * 0.6, 6);
    const y = (t: number) => figure(compose('lift', input(t))).eye[1];
    expect(y(0)).toBeCloseTo(H * 0.36 + H * 0.95, 6);
    expect(Math.min(...[0.15, 0.2, 0.25, 0.3].map(y))).toBeLessThan(H * 0.36);
    expect(y(0.36)).toBeCloseTo(H * 0.36, 6);
  });

  it('重擊：0.18 秒前沒有重擊字；砸下時從 2.3 倍縮到 1 倍；0.3 秒後有墨點；位置與大小照設定', () => {
    const stamp = (t: number, extra: Partial<SceneInput> = {}) =>
      find(compose('impact', input(t, extra)), (l) => l.type === 'stamp') as
        | Extract<Layer, { type: 'stamp' }>
        | undefined;
    expect(stamp(0.17)).toBeUndefined();
    expect(stamp(0.18)?.zoom).toBeCloseTo(2.3, 6);
    expect(stamp(0.6)?.zoom).toBe(1);
    expect(stamp(0.6)?.splash).toBe(true);
    expect(stamp(0.6)?.size).toBe(Math.round(H * 0.66));
    const moved = stamp(0.6, {
      impact: { x: 10, y: -20, size: 50, track: 10, gaps: [-30] },
    });
    expect(moved?.at[0]).toBeCloseTo(-W * 0.13 + W * 0.1, 6);
    expect(moved?.at[1]).toBeCloseTo(H * 0.02 - H * 0.2, 6);
    expect(moved?.size).toBe(Math.round(H * 0.66 * 0.5));
    expect(moved?.gaps).toEqual([-0.2]);
    /* 沒有字時不畫 */
    expect(stamp(0.6, { impactText: [] })).toBeUndefined();
    /* 帶子斜 -0.2 弧度、從右邊衝進來 */
    const g0 = compose('impact', input(0))[0] as Extract<Layer, { type: 'group' }>;
    expect(g0.turn).toBe(-0.2);
    expect(g0.at?.[0]).toBeCloseTo(W / 2 + W * 1.2, 6);
  });

  it('VS：兩塊從兩邊衝進來；0.2 秒砸下 VS（2.6 倍縮到 1 倍）；右邊是對手；兩個名字一起縮字', () => {
    const vs = (t: number) =>
      find(compose('versus', input(t)), (l) => l.type === 'group' && l.zoom !== undefined) as
        | Extract<Layer, { type: 'group' }>
        | undefined;
    expect(vs(0.19)).toBeUndefined();
    expect(vs(0.2)?.zoom).toBeCloseTo(2.6, 6);
    expect(vs(0.5)?.zoom).toBe(1);
    const rival = figure(compose('versus', input(0.5)), 'rival');
    expect(rival.eye[0]).toBeCloseTo(W * 0.76, 6);
    const names = all(compose('versus', input(0.5)), (l) => l.type === 'text' && l.role === 'name');
    expect(names).toHaveLength(2);
    expect(names.every((n) => n.type === 'text' && n.fit?.peers?.length === 2)).toBe(true);
    /* 剪影的名字空白時只畫左邊的名字 */
    expect(
      all(
        compose('versus', input(0.5, { rivalName: '' })),
        (l) => l.type === 'text' && l.role === 'name',
      ),
    ).toHaveLength(1);
  });
});
