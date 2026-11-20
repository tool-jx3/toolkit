/**
 * 場景轉換素材產生器：剪影轉場 E54～E57（花瓣飛舞、羽毛飄落、眨眼、蝙蝠群；2026-11-20，規格 1.12、3.6）與預覽的立繪（F74～F78）。
 * - 蓋滿要真的蓋滿：蓋上的最後一格整片不透明、揭開的最後一格完全透明（每一種、幾個花紋編號、四種尺寸）；
 *   最後一格之前，所有的片都落定時已經沒有縫（最後補一層不會「跳」）；
 * - 出現順序、反向順序、揭開（最先蓋上的最先離開）、蓋上再揭開的回程、掃過、推進比例；
 * - 眨眼的閉合方式與眼皮弧度；同一個花紋編號畫面相同；
 * - 點陣化（覆蓋率、模糊）；依效果出現的設定（F22）；立繪的位置與大小。
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIES, EFFECTS, effectById } from '@/tools/scene-transition/effects';
import {
  applyEffect,
  exportFileName,
  normalizeSettings,
  showsReverseOrder,
  silhouetteParams,
  visibleFields,
} from '@/tools/scene-transition/model';
import {
  newPortrait,
  normalizePreview,
  PORTRAIT_HEIGHT,
  placePortrait,
  portraitWidth,
  replacePortraitImage,
  resizePortrait,
} from '@/tools/scene-transition/previewStore';
import { blurCoverage, Rasterizer } from '@/tools/scene-transition/raster';
import { mergeRuns, planOf, renderFrame } from '@/tools/scene-transition/render';
import { type Settings, SIZE_IDS, sizeOf } from '@/tools/scene-transition/settings';
import {
  blinkClosure,
  buildSilhouetteScene,
  isSilhouetteShape,
  SILHOUETTE_TIMING,
  type SilhouetteShape,
} from '@/tools/scene-transition/silhouette';

const IDS = ['E54', 'E55', 'E56', 'E57'] as const;

/** 一格的 RGBA */
function frameAt(s: Settings, index: number, w: number, h: number): Uint8ClampedArray {
  const plan = planOf(s, w, h, w / sizeOf(s.size).width);
  const out = new Uint8ClampedArray(w * h * 4);
  renderFrame(plan, plan.frames[index < 0 ? plan.frames.length + index : index], null, out);
  return out;
}

const hexRgb = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));

/** 整片都是 alpha（不透明時另外檢查顏色） */
function expectUniform(px: Uint8ClampedArray, alpha: number, color: string, label: string) {
  const [r, g, b] = hexRgb(color);
  let bad = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== alpha) bad++;
    else if (alpha === 255 && (px[i] !== r || px[i + 1] !== g || px[i + 2] !== b)) bad++;
  }
  expect(bad, label).toBe(0);
}

/** 覆蓋率（某個範圍的平均不透明度 0～1） */
function coverage(
  px: Uint8ClampedArray,
  w: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
) {
  let sum = 0;
  let n = 0;
  for (let y = Math.round(y0); y < Math.round(y1); y++)
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      sum += px[(y * w + x) * 4 + 3];
      n++;
    }
  return sum / n / 255;
}

describe('E54～E57：效果與分類', () => {
  it('57 種效果；E54～E57 在新的「剪影」類，形狀是四種剪影', () => {
    expect(EFFECTS).toHaveLength(57);
    expect(CATEGORIES.map((c) => c.label)).toContain('剪影');
    expect(CATEGORIES).toHaveLength(10);
    for (const id of IDS) {
      const e = effectById(id);
      expect(e.category).toBe('silhouette');
      expect(isSilhouetteShape(e.shape)).toBe(true);
    }
    expect(IDS.map((id) => effectById(id).shape)).toEqual(['petals', 'feathers', 'blink', 'bats']);
  });

  it('初始設定（本站自己定）與檔名', () => {
    const p = applyEffect(null, 'E54');
    expect([p.color, p.duration, p.hold, p.curve, p.option, p.count, p.strength]).toEqual([
      '#f4b6c8',
      1.6,
      0.4,
      'linear',
      'sakura',
      14,
      55,
    ]);
    const f = applyEffect(null, 'E55');
    expect([f.direction, f.count, f.duration]).toEqual(['down', 12, 1.8]);
    const b = applyEffect(null, 'E56');
    expect([b.color, b.option, b.softness, b.strength, b.duration]).toEqual([
      '#000000',
      'flutter',
      90,
      50,
      1.6,
    ]);
    const v = applyEffect(null, 'E57');
    expect([v.color, v.option, v.count, v.duration, v.hold]).toEqual([
      '#0b0710',
      'rise',
      24,
      2,
      0.5,
    ]);
    expect(exportFileName(v, 'webp')).toBe('蝙蝠群.webp');
    expect(exportFileName({ ...p, reversePlay: true }, 'png')).toBe('花瓣飛舞（倒著播放）.png');
  });

  it('依效果出現的設定（F22）', () => {
    const f = (s: Settings) => [...visibleFields(s)].sort();
    const p = applyEffect(null, 'E54');
    expect(f(p)).toEqual(['count', 'direction', 'option', 'order', 'seed', 'strength']);
    expect(f({ ...p, order: 'center' })).toEqual([
      'center',
      'count',
      'option',
      'order',
      'seed',
      'strength',
    ]);
    expect(f({ ...p, order: 'random' })).toEqual(['count', 'option', 'order', 'seed', 'strength']);
    expect(f(applyEffect(null, 'E55'))).toEqual([
      'count',
      'direction',
      'order',
      'seed',
      'strength',
    ]);
    expect(f(applyEffect(null, 'E56'))).toEqual(['option', 'strength']);
    const bats = applyEffect(null, 'E57');
    expect(f(bats)).toEqual(['count', 'option', 'seed']);
    expect(f({ ...bats, option: 'close' })).toEqual(['center', 'count', 'option', 'seed']);
    expect(f({ ...bats, option: 'direction' })).toEqual(['count', 'direction', 'option', 'seed']);
    expect(f({ ...bats, mode: 'sweep', glow: true })).toEqual([
      'bandWidth',
      'count',
      'glowColor',
      'option',
      'seed',
    ]);
  });

  it('反向順序只有眨眼不出現（E01～E53 一律出現）', () => {
    for (const e of EFFECTS) expect(showsReverseOrder({ effect: e.id }), e.id).toBe(e.id !== 'E56');
  });

  it('數量的範圍、形狀選項與存檔修正', () => {
    expect(normalizeSettings({ effect: 'E54', count: 99, option: 'x' })).toMatchObject({
      count: 30,
      option: 'sakura',
    });
    expect(normalizeSettings({ effect: 'E55', count: 1 }).count).toBe(6);
    expect(normalizeSettings({ effect: 'E57', count: 3, option: 'close' })).toMatchObject({
      count: 8,
      option: 'close',
    });
    expect(normalizeSettings({ effect: 'E56', option: 'once' }).option).toBe('once');
    /* 從別的效果換過來：數量夾在新的範圍內 */
    expect(applyEffect({ ...applyEffect(null, 'E45'), count: 180 }, 'E57').count).toBe(24);
    const s = { ...applyEffect(null, 'E57'), seed: 99, centerX: 0.3 };
    expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('蓋滿要真的蓋滿、揭開要完全透明（每一種 × 花紋編號 × 四種尺寸）', () => {
  for (const id of IDS)
    for (const size of SIZE_IDS)
      it(`${id} ${size}`, () => {
        const { width: w, height: h } = sizeOf(size);
        for (const seed of [1, 7, 4321]) {
          const base: Settings = { ...applyEffect(null, id), size, seed };
          const color = base.color;
          /* 蓋上：第一格完全透明、最後一格整片不透明 */
          expectUniform(frameAt(base, 0, w, h), 0, color, `${id} 蓋上第一格 #${seed}`);
          expectUniform(frameAt(base, -1, w, h), 255, color, `${id} 蓋上最後一格 #${seed}`);
          /* 揭開：第一格整片不透明、最後一格完全透明 */
          const rv = { ...base, mode: 'reveal' as const };
          expectUniform(frameAt(rv, 0, w, h), 255, color, `${id} 揭開第一格 #${seed}`);
          expectUniform(frameAt(rv, -1, w, h), 0, color, `${id} 揭開最後一格 #${seed}`);
          /* 蓋上再揭開：中間全蓋、最後全透明 */
          const rt = { ...base, mode: 'roundtrip' as const };
          const n = planOf(rt, 8, 8).frames.length;
          expectUniform(frameAt(rt, (n - 1) / 2, w, h), 255, color, `${id} 來回中間 #${seed}`);
          expectUniform(frameAt(rt, -1, w, h), 0, color, `${id} 來回最後一格 #${seed}`);
        }
      });

  it('最後一格之前：所有的片都落定時已經沒有縫（最後補的一層不會突然出現）', () => {
    const variants: [string, Partial<Settings>][] = [
      ['E54', {}],
      ['E54', { option: 'round', count: 30 }],
      ['E54', { count: 6, order: 'center' }],
      ['E55', {}],
      ['E55', { count: 6, order: 'random' }],
      ['E57', {}],
      ['E57', { count: 8, option: 'close' }],
      ['E57', { count: 40, option: 'direction', direction: 'up-left' }],
    ];
    for (const [id, extra] of variants)
      for (const [w, h] of [
        [640, 360],
        [1280, 720],
      ])
        for (const seed of [7, 4321]) {
          const s = { ...applyEffect(null, id), ...extra, seed };
          const scene = buildSilhouetteScene(
            effectById(id).shape as SilhouetteShape,
            w,
            h,
            silhouetteParams(s),
          );
          const out = new Float32Array(w * h);
          const last =
            SILHOUETTE_TIMING.ORDER_RANGE + SILHOUETTE_TIMING.JITTER + SILHOUETTE_TIMING.FLY;
          scene.paint({ kind: 'arrive', level: last + 0.001 }, 0, out);
          let holes = 0;
          for (const v of out) if (v < 0.999) holes++;
          expect(holes, `${id} ${JSON.stringify(extra)} ${w} #${seed}`).toBe(0);
        }
  });
});

describe('順序與轉場方式', () => {
  const W = 320;
  const H = 180;
  const at = (s: Settings, k: number) =>
    frameAt({ ...s, fps: 10 as Settings['fps'], duration: 10.1, hold: 0 }, k, W, H);
  const left = (px: Uint8ClampedArray) => coverage(px, W, 0, W / 2, 0, H);
  const right = (px: Uint8ClampedArray) => coverage(px, W, W / 2, W, 0, H);

  it('花瓣：從左到右（左邊先蓋）；反向順序時右邊先；揭開時左邊先離開', () => {
    const s = applyEffect(null, 'E54');
    const a = at(s, 40);
    expect(left(a)).toBeGreaterThan(right(a) + 0.3);
    const r = at({ ...s, reverseOrder: true }, 40);
    expect(right(r)).toBeGreaterThan(left(r) + 0.3);
    const rv = at({ ...s, mode: 'reveal' }, 60);
    expect(right(rv)).toBeGreaterThan(left(rv) + 0.3);
  });

  it('羽毛：從上到下；從中心時中央先蓋', () => {
    const s = applyEffect(null, 'E55');
    const a = at(s, 40);
    expect(coverage(a, W, 0, W, 0, H / 3)).toBeGreaterThan(
      coverage(a, W, 0, W, (2 * H) / 3, H) + 0.3,
    );
    const c = at({ ...s, order: 'center' }, 35);
    expect(coverage(c, W, W / 3, (2 * W) / 3, H / 3, (2 * H) / 3)).toBeGreaterThan(
      coverage(c, W, 0, W / 6, 0, H / 6) + 0.3,
    );
  });

  it('蝙蝠群：從下方湧上（下緣中央先）、從四周合攏（四角先、中央最後）', () => {
    const s = applyEffect(null, 'E57');
    const a = at(s, 50);
    expect(coverage(a, W, W / 3, (2 * W) / 3, (2 * H) / 3, H)).toBeGreaterThan(
      coverage(a, W, 0, W / 6, 0, H / 6) + 0.5,
    );
    const c = at({ ...s, option: 'close' }, 50);
    expect(coverage(c, W, 0, W / 8, 0, H / 8)).toBeGreaterThan(
      coverage(c, W, (3 * W) / 8, (5 * W) / 8, (3 * H) / 8, (5 * H) / 8) + 0.5,
    );
    /* 揭開：下緣中央最先變透明 */
    const rv = at({ ...s, mode: 'reveal' }, 50);
    expect(coverage(rv, W, 0, W, 0, H / 6)).toBeGreaterThan(
      coverage(rv, W, W / 3, (2 * W) / 3, (5 * H) / 6, H) + 0.5,
    );
  });

  it('蓋上再揭開的回程照「揭開」：先蓋上的先離開（不是去程倒過來）', () => {
    const s = { ...applyEffect(null, 'E54'), mode: 'roundtrip' as const };
    const go = at(s, 40);
    expect(left(go)).toBeGreaterThan(right(go));
    /* 回程（第 101 格以後）中段：左邊先空 */
    const back = at(s, 160);
    expect(right(back)).toBeGreaterThan(left(back) + 0.3);
  });

  it('掃過：一條花瓣帶從左走到右，前後都是透明；推進比例 50% 時停在一半', () => {
    const s = { ...applyEffect(null, 'E54'), mode: 'sweep' as const, bandWidth: 80 };
    expect(coverage(at(s, 0), W, 0, W, 0, H)).toBe(0);
    expect(coverage(at(s, 100), W, 0, W, 0, H)).toBe(0);
    const mid = at(s, 50);
    const c = coverage(mid, W, 0, W, 0, H);
    expect(c).toBeGreaterThan(0.2);
    expect(c).toBeLessThan(0.99);
    const half = at({ ...applyEffect(null, 'E54'), reach: 50 }, 100);
    const ch = coverage(half, W, 0, W, 0, H);
    expect(ch).toBeGreaterThan(0.2);
    expect(ch).toBeLessThan(0.9);
    expect(left(half)).toBeGreaterThan(right(half));
  });

  it('同一個花紋編號畫面相同、換編號就不同；蝙蝠在飛的時候會拍翅膀', () => {
    for (const id of ['E54', 'E55', 'E57']) {
      const s = applyEffect(null, id);
      expect(Array.from(at(s, 45))).toEqual(Array.from(at(s, 45)));
      expect(Array.from(at({ ...s, seed: 8 }, 45))).not.toEqual(Array.from(at(s, 45)));
    }
    /* 同一個進度、不同時間（拍翅膀）：只在不同的影格表裡才看得出來——用每秒格數改變時間 */
    const plan = planOf(applyEffect(null, 'E57'), W, H);
    expect(mergeRuns(plan, null).length).toBeGreaterThan(plan.frames.length * 0.5);
  });
});

describe('眨眼', () => {
  it('閉合方式：先眨一下（閉到 72%、張回到 40%、再閉上）／直接閉上', () => {
    expect(blinkClosure('flutter', 0)).toBe(0);
    expect(blinkClosure('flutter', 0.4)).toBeCloseTo(0.72, 6);
    expect(blinkClosure('flutter', 0.6)).toBeCloseTo(0.4, 6);
    expect(blinkClosure('flutter', 1)).toBe(1);
    expect(blinkClosure('once', 0.3)).toBeCloseTo(0.3, 6);
  });

  it('眼皮弧度 0 是平直的（每一欄相同），越大中間開得越大、兩側越早合起來；揭開是倒過來', () => {
    const W = 320;
    const H = 180;
    const s = { ...applyEffect(null, 'E56'), option: 'once', softness: 1 };
    const scene = (strength: number) =>
      buildSilhouetteScene('blink', W, H, silhouetteParams({ ...s, strength }));
    const out = new Float32Array(W * H);
    scene(0).paint({ kind: 'arrive', level: 0.5 }, 0, out);
    const col = (x: number) => Array.from({ length: H }, (_, y) => out[y * W + x]);
    expect(col(10)).toEqual(col(160));
    scene(100).paint({ kind: 'arrive', level: 0.5 }, 0, out);
    const open = (x: number) => col(x).filter((v) => v < 0.5).length;
    expect(open(160)).toBeGreaterThan(open(20) + 10);
    const rev = new Float32Array(W * H);
    scene(100).paint({ kind: 'depart', level: 0.5 }, 0, rev);
    expect(Array.from(rev)).toEqual(Array.from(out));
  });

  it('邊緣發光：眼皮的邊帶著發光顏色', () => {
    const s = { ...applyEffect(null, 'E56'), glow: true, glowColor: '#ff0000' };
    const px = frameAt({ ...s, fps: 10 as Settings['fps'], duration: 10.1, hold: 0 }, 50, 320, 180);
    let red = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 3] > 100) red++;
    expect(red).toBeGreaterThan(100);
  });
});

describe('點陣化', () => {
  it('多邊形的覆蓋率：面積正確、邊緣反鋸齒', () => {
    const r = new Rasterizer(20, 20);
    const sum = (pts: number[]) => {
      let total = 0;
      const cells: number[] = [];
      r.fill(Float64Array.from(pts), pts.length / 2, (_y, x0, x1, row) => {
        for (let x = x0; x < x1; x++) {
          total += row[x];
          cells.push(row[x]);
        }
      });
      return { total, cells };
    };
    /* 2.5～7.5 的正方形：面積 25，邊上的像素一半 */
    const sq = sum([2.5, 2.5, 7.5, 2.5, 7.5, 7.5, 2.5, 7.5]);
    expect(sq.total).toBeCloseTo(25, 6);
    expect(sq.cells.some((c) => Math.abs(c - 0.5) < 1e-6)).toBe(true);
    /* 直角三角形：面積 50 */
    expect(sum([0, 0, 10, 0, 0, 10]).total).toBeCloseTo(50, 1);
    /* 畫面外的部分切掉 */
    expect(sum([-10, -10, 30, -10, 30, 30, -10, 30]).total).toBeCloseTo(400, 6);
  });

  it('模糊：整片蓋滿仍是 1、空的仍是 0；邊界變成漸層', () => {
    const W = 40;
    const H = 10;
    const full = new Float32Array(W * H).fill(1);
    blurCoverage(full, W, H, 4);
    expect(full.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    const half = new Float32Array(W * H).map((_, i) => (i % W < 20 ? 1 : 0));
    blurCoverage(half, W, H, 3);
    expect(half[5 * W + 19]).toBeGreaterThan(0.5);
    expect(half[5 * W + 19]).toBeLessThan(1);
    expect(half[5 * W + 0]).toBeCloseTo(1, 6);
    expect(half[5 * W + 39]).toBeCloseTo(0, 6);
  });
});

describe('預覽的立繪（F74～F78）', () => {
  it('新的立繪：高 90%、左右置中、腳底貼齊下緣；寬度依長寬比換算', () => {
    const p = newPortrait('a', 0.5);
    expect(p.height).toBe(PORTRAIT_HEIGHT.initial);
    expect(p.y).toBe(10);
    /* 寬＝高 × 長寬比 ÷ 畫面長寬比：90 × 0.5 ÷ (16 / 9) */
    expect(portraitWidth(p)).toBeCloseTo((90 * 0.5 * 9) / 16, 9);
    expect(p.x + portraitWidth(p) / 2).toBeCloseTo(50, 9);
  });

  it('改大小：腳底與中心不動、夾在 10%～200%；移動：中心留在畫面裡', () => {
    const p = newPortrait('a', 0.5);
    const big = resizePortrait(p, 150);
    expect(big.height).toBe(150);
    expect(big.y + big.height).toBeCloseTo(100, 9);
    expect(big.x + portraitWidth(big) / 2).toBeCloseTo(50, 9);
    expect(resizePortrait(p, 999).height).toBe(PORTRAIT_HEIGHT.max);
    expect(resizePortrait(p, 1).height).toBe(PORTRAIT_HEIGHT.min);
    const far = placePortrait({ ...p, x: 500, y: -500 });
    expect(far.x + portraitWidth(far) / 2).toBeCloseTo(100, 9);
    expect(far.y + far.height / 2).toBeCloseTo(0, 9);
  });

  it('換一張長寬比不同的圖：左右中心、腳底、高度不變（夾住時以夾住為準）', () => {
    const expectSame = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 9);
    };
    const anchor = (p: ReturnType<typeof newPortrait>) => [
      p.x + portraitWidth(p) / 2,
      p.y + p.height,
      p.height,
    ];
    /* 100 × 200（0.5）中心 50% → 300 × 100（3）→ 換回 */
    const tall = newPortrait('a', 0.5);
    const wide = replacePortraitImage(tall, 'b', 3);
    expect(wide.id).toBe('b');
    expect(wide.aspect).toBe(3);
    expectSame(anchor(wide), anchor(tall));
    const back = replacePortraitImage(wide, 'a', 0.5);
    expectSame(anchor(back), anchor(tall));
    /* 中心在左緣（0%）、改小、往上：換成寬圖仍在 0% */
    const edge = placePortrait({
      ...resizePortrait(tall, 60),
      x: -portraitWidth({ aspect: 0.5, height: 60 }) / 2,
      y: 20,
    });
    const edgeWide = replacePortraitImage(edge, 'b', 3);
    expectSame(anchor(edgeWide), anchor(edge));
    expect(anchor(edgeWide)[0]).toBeCloseTo(0, 9);
  });

  it('存下的值讀回時修正（背景的種類、沒有圖時的背景圖、立繪的數字）', () => {
    expect(normalizePreview(null)).toEqual({
      background: 'scene',
      backgroundImage: null,
      portrait: null,
    });
    expect(normalizePreview({ background: 'dark' }).background).toBe('scene');
    expect(normalizePreview({ background: 'image', backgroundImage: null }).background).toBe(
      'scene',
    );
    expect(normalizePreview({ background: 'image', backgroundImage: 'b' }).background).toBe(
      'image',
    );
    expect(normalizePreview({ portrait: { id: 'x', aspect: 0 } }).portrait).toBeNull();
    const p = normalizePreview({
      portrait: { id: 'x', aspect: 0.5, x: 20, y: 5, height: 999 },
    }).portrait;
    expect(p?.height).toBe(PORTRAIT_HEIGHT.max);
  });
});
