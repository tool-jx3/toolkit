/**
 * G2 共用層 core/transition：到達先後圖＋查表的轉場引擎。
 * 用附件 scene-transition.effects.json（舊版的量測）驗證：
 * - 非隨機效果：到達順序圖（等速、柔和度 1、蓋上；16×9 點）相差 ≤ 1%；初始設定下 25／50／75% 的 16×9 區塊平均透明度；
 * - 隨機效果（方塊溶解、暈染、垂流、撕裂帶、方塊雨）：花紋與原作相同（同一花紋編號），覆蓋率曲線與不透明／透明比例只差四捨五入；
 * - 各形狀的到達先後與原作的公式逐值相同（scene-transition 對等修正；圖形的輪廓取樣除外）；
 * - 邊緣發光、邊緣實心、雙色閃換、柔和度與帶寬的規則（規格 3.3、3.5）。
 */
import { describe, expect, it } from 'vitest';
import { getCurve } from '@/core/timeline';
import {
  type ArrivalParams,
  alternatingColorIndex,
  buildArrivalMap,
  coverAmount,
  type Direction8,
  glowStrength,
  renderTransition,
  shapeParams,
  type TransitionShape,
  transitionLut,
} from '@/core/transition';

import EFFECTS from '../../../docs/refactor/specs/scene-transition.effects.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON 的欄位依效果不同
const J = EFFECTS as unknown as { 效果: any[] };
const W = 640;
const H = 360;

/* 附件的設定名稱 → 引擎的參數（工具實作時用自己的設定格式） */
const SHAPE: Record<string, TransitionShape> = {
  整片: 'flat',
  直線擦除: 'linear',
  斜線擦除: 'diagonal',
  兩側合攏: 'split',
  百葉窗: 'blinds',
  圓形: 'circle',
  方塊溶解: 'dissolve',
  旋轉合攏: 'rotate',
  波浪邊: 'wave',
  暈染: 'ink',
  垂流: 'drip',
  時鐘: 'clock',
  螺旋: 'spiral',
  圖形: 'figure',
  格子: 'grid',
  撕裂帶: 'tear',
  方塊雨: 'rain',
  隔行掃描: 'interlace',
  同心環: 'rings',
  六角格: 'hex',
};
const DIR: Record<string, ArrivalParams['direction']> = {
  往右: 'right',
  往左: 'left',
  往下: 'down',
  往上: 'up',
  往右下: 'down-right',
  往左下: 'down-left',
  往右上: 'up-right',
  往左上: 'up-left',
};
const CURVE: Record<string, string> = {
  慢進慢出: 'smoothstep',
  等速: 'linear',
  加速: 'quadIn',
  減速: 'quadOut',
  彈跳: 'bounceOut',
  明滅後蓋上: 'flicker',
  雷閃: 'lightning',
  心跳: 'heartbeat',
};
const MODE = { 蓋上: 'cover', 揭開: 'reveal', 掃過: 'sweep', 蓋上再揭開: 'cover' } as const;
const OPT: Record<string, Partial<ArrivalParams>> = {
  圓滑波: { wave: 'sine' },
  鋸齒: { wave: 'saw' },
  方波: { wave: 'square' },
  星形: { figure: 'star' },
  心形: { figure: 'heart' },
  菱形: { figure: 'diamond' },
  方形: { figure: 'square' },
  六角形: { figure: 'hexagon' },
  順時針: { clock: 'clockwise' },
  左右對稱: { clock: 'symmetric' },
  沿方向: { spread: 'direction' },
  從中心: { spread: 'center' },
};
const ORDER: Record<string, ArrivalParams['order']> = {
  沿方向: 'direction',
  從中心: 'center',
  隨機: 'random',
  交錯分組: 'alternate',
};

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
type Effect = any;

function paramsOf(e: Effect): ArrivalParams {
  const s = e.初始設定;
  const p: ArrivalParams = {};
  if (s.方向) p.direction = DIR[s.方向];
  if (s.軸向) p.axis = s.軸向 === '上下' ? 'vertical' : 'horizontal';
  if (s.數量 !== undefined) p.count = s.數量;
  if (s.強度 !== undefined) p.strength = s.強度;
  if (s['方塊大小（px）'] !== undefined) p.blockSize = s['方塊大小（px）'];
  if (s.圓的比例) p.ellipse = s.圓的比例 === '橢圓';
  if (s.中心) p.center = s.中心;
  if (s.花紋編號 !== undefined) p.seed = s.花紋編號;
  if (s.形狀選項) {
    if (e.形狀 === '格子')
      p.cell = ({ 方形: 'square', 圓形: 'circle', 菱形: 'diamond' } as const)[s.形狀選項 as '方形'];
    else Object.assign(p, OPT[s.形狀選項]);
  }
  if (s.出現順序) p.order = ORDER[s.出現順序];
  return p;
}

/** 一格的透明度（measure＝附件「到達順序圖」的量測條件） */
function alphaAt(e: Effect, pct: number, measure: boolean): Uint8Array {
  const s = e.初始設定;
  const shape = SHAPE[e.形狀];
  const p = paramsOf(e);
  const curve = measure ? (x: number) => x : getCurve(CURVE[s.速度曲線] ?? 'smoothstep');
  const eased = curve(pct / 100);
  if (shape === 'rotate') p.angle = (((s.強度 ?? 50) * 3.6 * Math.PI) / 180) * eased;
  const map = buildArrivalMap(shape, W, H, p);
  const lut = transitionLut(
    {
      progress: eased * (measure ? 1 : s['推進比例（%）'] / 100),
      mode: measure ? 'cover' : MODE[s.轉場方式 as keyof typeof MODE],
      softness: measure ? 1 : s.邊緣柔和度,
      bandWidth: s.帶寬 ?? 80,
      reverse: s.反向順序,
      color: '#000000',
      glow: !measure && s.邊緣發光 ? s.發光顏色 : null,
      solidEdge: !measure && ['E49', 'E50', 'E51'].includes(e.編號),
    },
    map.flat,
    map.range,
  );
  const a = new Uint8Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = lut.alpha[map.levels[i]];
  return a;
}

const grid = (v: unknown): number[][] =>
  Array.isArray(v)
    ? v.map((r: string) => r.split(' ').map(Number))
    : Array.from({ length: 9 }, () => Array(16).fill(Number(String(v).replace('全部 ', ''))));

/** 到達順序圖：每個取樣點第一次 ≥ 128 的 % */
function arrivalGrid(e: Effect): number[][] {
  const shape = SHAPE[e.形狀];
  const out = Array.from({ length: 9 }, () => Array(16).fill(-1));
  const pts = Array.from(
    { length: 144 },
    (_, k) => (20 + 40 * Math.floor(k / 16)) * W + 20 + 40 * (k % 16),
  );
  if (shape === 'rotate') {
    for (let k = 0; k <= 100; k++) {
      const a = alphaAt(e, k, true);
      pts.forEach((idx, n) => {
        const j = Math.floor(n / 16);
        const i = n % 16;
        if (out[j][i] < 0 && a[idx] >= 128) out[j][i] = k;
      });
    }
    return out;
  }
  /* 靜態形狀：直接由到達先後換算（柔和度 1、蓋上：p ≥ (a + w/2)/(1 + w)） */
  const map = buildArrivalMap(shape, W, H, paramsOf(e));
  const rev = e.初始設定.反向順序;
  pts.forEach((idx, n) => {
    for (let k = 0; k <= 100; k++) {
      const c = coverAmount(
        map.levels[idx],
        { progress: k / 100, softness: 1, reverse: rev, color: '#000000' },
        map.flat,
        map.range,
      );
      if (Math.round(c * 255) >= 128) {
        out[Math.floor(n / 16)][n % 16] = k;
        break;
      }
    }
  });
  return out;
}

const RANDOM = new Set(['E30', 'E31', 'E35', 'E36', 'E37', 'E43', 'E44', 'E47']);
/*
 * 區塊平均透明度的容許差：≤ 3（規格 3.10）；圖形（星形、心形、菱形）的輪廓取樣方式與原作略有不同（見 DESIGN.md）。
 * scene-transition 對等修正後，其餘形狀的到達先後與原作逐值相同（時鐘、六角格、同心環、旋轉合攏也是）。
 */
const BLOCK_TOL: Record<string, number> = {
  E26: 7,
  E27: 8,
  E28: 7,
};

describe('非隨機效果：到達順序圖與區塊透明度', () => {
  for (const e of J.效果 as Effect[]) {
    if (RANDOM.has(e.編號)) continue;
    it(`${e.編號} ${e.名稱}（${e.形狀}）`, () => {
      const ref = grid(e['到達順序圖（等速、柔和度 1、蓋上；16×9 點，動作的 %）']);
      const got = arrivalGrid(e);
      let max = 0;
      let sum = 0;
      for (let j = 0; j < 9; j++)
        for (let i = 0; i < 16; i++) {
          const d = Math.abs(got[j][i] - ref[j][i]);
          max = Math.max(max, d);
          sum += d;
        }
      expect(max, '到達時間').toBeLessThanOrEqual(1);
      expect(sum / 144, '平均到達時間差').toBeLessThanOrEqual(1);
      let bmax = 0;
      for (const pct of [25, 50, 75]) {
        const refB = grid(e.量測.取樣[`${pct}%`]['16×9 區塊平均透明度']);
        const a = alphaAt(e, pct, false);
        for (let j = 0; j < 9; j++)
          for (let i = 0; i < 16; i++) {
            let sum = 0;
            for (let y = 0; y < 40; y++)
              for (let x = 0; x < 40; x++) sum += a[(j * 40 + y) * W + i * 40 + x];
            bmax = Math.max(bmax, Math.abs(Math.round(sum / 1600) - refB[j][i]));
          }
      }
      expect(bmax, '區塊平均透明度').toBeLessThanOrEqual(BLOCK_TOL[e.編號] ?? 3);
    });
  }
});

describe('隨機效果：覆蓋率曲線與比例（花紋與原作相同）', () => {
  for (const id of RANDOM) {
    const e = (J.效果 as Effect[]).find((x) => x.編號 === id);
    it(`${id} ${e.名稱}`, () => {
      const s = e.初始設定;
      const map = buildArrivalMap(SHAPE[e.形狀], W, H, paramsOf(e));
      const curve = getCurve(CURVE[s.速度曲線]);
      const ref: number[] = e.量測['覆蓋率曲線（0～100%，每 5%）'];
      let cmax = 0;
      for (let k = 0; k <= 20; k++) {
        const lut = transitionLut(
          {
            progress: curve(k / 20),
            softness: s.邊緣柔和度,
            color: '#000000',
            glow: s.邊緣發光 ? s.發光顏色 : null,
          },
          map.flat,
          map.range,
        );
        let sum = 0;
        let op = 0;
        let tr = 0;
        for (const L of map.levels) {
          const a = lut.alpha[L];
          sum += a;
          if (a >= 250) op++;
          else if (a <= 5) tr++;
        }
        cmax = Math.max(cmax, Math.abs(sum / map.levels.length / 255 - ref[k]));
        if (k === 10) {
          const r = e.量測.取樣['50%'];
          /* 花紋與原作相同（同一花紋編號）：只差附件的四捨五入 */
          expect(Math.abs(op / map.levels.length - r.不透明比例)).toBeLessThanOrEqual(0.002);
          expect(Math.abs(tr / map.levels.length - r.透明比例)).toBeLessThanOrEqual(0.002);
        }
      }
      expect(cmax).toBeLessThanOrEqual(0.002);
    });
  }

  it('方塊溶解：方塊大小依 px、同一塊同時變化、同編號同花紋', () => {
    const a = buildArrivalMap('dissolve', 640, 360, { blockSize: 24, seed: 3 });
    const b = buildArrivalMap('dissolve', 640, 360, { blockSize: 24, seed: 3 });
    const c = buildArrivalMap('dissolve', 640, 360, { blockSize: 24, seed: 4 });
    expect(a.levels).toEqual(b.levels);
    expect(a.levels).not.toEqual(c.levels);
    /* 640 ÷ 24 → 26 塊，每塊約 24.6 px：同一塊裡的到達先後都相同 */
    expect(a.levels[0]).toBe(a.levels[23 * 640 + 23]);
    expect(a.levels[0]).not.toBe(a.levels[30]);
  });

  it('垂流：最長的液滴先到底（強度越大越早）', () => {
    const bottom = (strength: number) => {
      const m = buildArrivalMap('drip', 640, 360, { count: 22, strength, seed: 11 });
      let first = 255;
      for (let x = 0; x < 640; x++) first = Math.min(first, m.levels[359 * 640 + x]);
      /* 等速、柔和度 1 時到達的時間 */
      return first / 255;
    };
    const t0 = bottom(0);
    const t60 = bottom(60);
    const t100 = bottom(100);
    expect(t0).toBeGreaterThan(0.95);
    expect(Math.abs(t60 - 0.78)).toBeLessThan(0.04);
    expect(Math.abs(t100 - 0.68)).toBeLessThan(0.04);
  });
});

describe('畫面規則', () => {
  it('柔和度：過渡帶寬＝柔和度 ÷ 255 的全範圍（640 寬、往右、等速）', () => {
    const map = buildArrivalMap('linear', 640, 1, { direction: 'right' });
    const edge = (softness: number, p: number) => {
      const lut = transitionLut({ progress: p, softness, color: '#000000' });
      const a = Array.from(map.levels, (L) => lut.alpha[L]);
      const half = a.findIndex((v) => v < 128);
      return { half, left: a[0] };
    };
    expect(Math.abs(edge(25, 0.25).half - 145)).toBeLessThanOrEqual(2);
    expect(Math.abs(edge(40, 0.25).half - 135)).toBeLessThanOrEqual(2);
    expect(Math.abs(edge(100, 0.25).half - 97)).toBeLessThanOrEqual(2);
    expect(Math.abs(edge(100, 0.25).left - 226)).toBeLessThanOrEqual(2);
    expect(Math.abs(edge(255, 0.25).left - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(edge(25, 0.75).half - 495)).toBeLessThanOrEqual(2);
  });

  it('掃過：帶寬 80、50% 時中心在 x≈320、x≈128／512 約 11', () => {
    const map = buildArrivalMap('linear', 640, 1, { direction: 'right' });
    const lut = transitionLut({ progress: 0.5, mode: 'sweep', bandWidth: 80, color: '#000000' });
    expect(lut.alpha[map.levels[320]]).toBeGreaterThanOrEqual(250);
    expect(Math.abs(lut.alpha[map.levels[128]] - 11)).toBeLessThanOrEqual(3);
    expect(Math.abs(lut.alpha[map.levels[512]] - 11)).toBeLessThanOrEqual(3);
    /* 開始與結束都透明 */
    for (const p of [0, 1]) {
      const l = transitionLut({ progress: p, mode: 'sweep', bandWidth: 80, color: '#000' });
      expect(Math.max(...Array.from(map.levels, (L) => l.alpha[L]))).toBe(0);
    }
  });

  it('整片：透明度＝進度 × 255；掃過以一半為頂點', () => {
    const c = '#000000';
    expect(Math.round(coverAmount(0, { progress: 0.4, color: c }, true) * 255)).toBe(102);
    expect(coverAmount(0, { progress: 0.5, mode: 'sweep', color: c }, true)).toBe(1);
    expect(coverAmount(0, { progress: 0.25, mode: 'sweep', color: c }, true)).toBe(0.5);
  });

  it('揭開＝255 − 蓋上；反向順序＝到達先後顛倒', () => {
    for (const L of [0, 60, 128, 200, 255]) {
      const c = transitionLut({ progress: 0.4, softness: 30, color: '#000' });
      const r = transitionLut({ progress: 0.4, softness: 30, mode: 'reveal', color: '#000' });
      expect(r.alpha[L]).toBe(255 - c.alpha[L]);
      const rv = transitionLut({ progress: 0.4, softness: 30, reverse: true, color: '#000' });
      expect(rv.alpha[L]).toBe(c.alpha[255 - L]);
    }
  });

  it('邊緣發光：強度表、顏色混合、透明度取較大者（規格 3.5.1 的實測）', () => {
    const table = [
      [0, 0],
      [32, 98],
      [64, 181],
      [96, 236],
      [128, 255],
      [160, 235],
      [192, 179],
      [224, 95],
      [255, 0],
    ];
    for (const [c, g] of table) expect(Math.abs(glowStrength(c) - g)).toBeLessThanOrEqual(1);
    /* 640 寬、往右、等速、柔和度 60、藍色、發光紅色、50% 時每 32 px 取一點 */
    const map = buildArrivalMap('linear', 640, 1, { direction: 'right' });
    const px = renderTransition(map, {
      progress: 0.5,
      softness: 60,
      color: '#0000ff',
      glow: '#ff0000',
    });
    const at = (x: number) => Array.from(px.slice(x * 4, x * 4 + 4));
    const samples = [
      0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512, 544, 576, 608,
    ].map(at);
    const want = [
      [59, 0, 196, 236],
      [202, 0, 53, 202],
      [255, 0, 0, 255],
      [202, 0, 53, 202],
      [59, 0, 196, 59],
    ];
    /* 實測的五點出現在連續的取樣上 */
    const start = samples.findIndex((s) => Math.abs(s[3] - 236) <= 6 && s[0] > 30 && s[0] < 90);
    expect(start).toBeGreaterThanOrEqual(0);
    want.forEach((w, k) => {
      const g = samples[start + k];
      for (let c = 0; c < 4; c++)
        expect(Math.abs(g[c] - w[c]), `${k}:${c}`).toBeLessThanOrEqual(12);
    });
    expect(samples[start - 1]).toEqual([0, 0, 255, 255]);
    expect(samples[start + 5]).toEqual([0, 0, 255, 0]);
  });

  it('邊緣實心：上下夾合成光線的最後一格是一條不透明、發亮的線（1280 × 720）', () => {
    const map = buildArrivalMap('split', 1280, 720, { axis: 'vertical' });
    const px = renderTransition(map, {
      progress: getCurve('quadIn')(1) * 0.96,
      softness: 30,
      color: '#0c0618',
      glow: '#f3eaff',
      solidEdge: true,
    });
    const at = (y: number) => Array.from(px.slice((y * 1280 + 640) * 4, (y * 1280 + 640) * 4 + 4));
    for (let y = 0; y < 720; y += 7) expect(at(y)[3]).toBe(255);
    expect(at(330)).toEqual([12, 6, 24, 255]);
    const mid = at(360);
    expect(Math.abs(mid[0] - 0xe3)).toBeLessThanOrEqual(8);
    expect(Math.abs(mid[1] - 0xda)).toBeLessThanOrEqual(8);
    expect(Math.abs(mid[2] - 0xef)).toBeLessThanOrEqual(8);
    /* 揭開時不作用 */
    const rv = renderTransition(map, {
      progress: 0.5,
      mode: 'reveal',
      softness: 30,
      color: '#0c0618',
      glow: '#f3eaff',
      solidEdge: true,
    });
    expect(rv[(0 * 1280 + 640) * 4 + 3]).toBe(255 - 255);
  });

  it('雙色閃換：前 75% 時間等分，之後維持最後一段（N＝4、2、1）', () => {
    const seq = (n: number) =>
      Array.from({ length: 101 }, (_, k) => alternatingColorIndex(k / 100, n));
    const four = seq(4);
    expect(four.slice(0, 19).every((v) => v === 0)).toBe(true);
    expect(four.slice(19, 38).every((v) => v === 1)).toBe(true);
    expect(four.slice(38, 57).every((v) => v === 0)).toBe(true);
    expect(four.slice(57).every((v) => v === 1)).toBe(true);
    const two = seq(2);
    expect(two.slice(0, 38).every((v) => v === 0)).toBe(true);
    expect(two.slice(38).every((v) => v === 1)).toBe(true);
    expect(seq(1).every((v) => v === 0)).toBe(true);
  });

  it('各形狀用到的參數（設定面板依此顯示欄位）', () => {
    expect(shapeParams('grid', { order: 'center' })).toEqual(['cell', 'order', 'center', 'count']);
    expect(shapeParams('grid', { order: 'random' })).toEqual(['cell', 'order', 'seed', 'count']);
    expect(shapeParams('hex', { order: 'alternate' })).toEqual(['order', 'count']);
    expect(shapeParams('ink', { spread: 'center' })).toContain('center');
    expect(shapeParams('flat')).toEqual([]);
  });

  it('格子、六角格、方塊雨：到達先後依整張圖正規化（最早的像素是 0、最晚的是 255）', () => {
    for (const [shape, p] of [
      ['grid', { count: 16, order: 'direction', direction: 'down-right' }],
      ['grid', { count: 8, order: 'alternate' }],
      ['hex', { count: 14, order: 'center' }],
      ['rain', { count: 48, seed: 21 }],
    ] as const) {
      const m = buildArrivalMap(shape, 640, 360, p);
      expect(
        m.levels.reduce((a, b) => Math.min(a, b), 255),
        shape,
      ).toBe(0);
      expect(
        m.levels.reduce((a, b) => Math.max(a, b), 0),
        shape,
      ).toBe(255);
    }
  });

  it('斜線擦除：水平、垂直各取 256 階再平均（無條件捨去），與原作相同', () => {
    const m = buildArrivalMap('diagonal', 640, 360, { direction: 'down-right' });
    const ramp = (n: number, i: number) => Math.round((255 * i) / (n - 1));
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [3, 7],
      [320, 180],
      [639, 359],
      [100, 300],
    ])
      expect(m.levels[y * 640 + x]).toBe((ramp(640, x) + ramp(360, y)) >> 1);
    const up = buildArrivalMap('diagonal', 640, 360, { direction: 'up-left' });
    expect(up.levels[359 * 640 + 639]).toBe(0);
    expect(up.levels[0]).toBe(255);
  });

  it('斜向：直線擦除照 45° 方向、斜線擦除從角落；直向的斜線擦除＝直線擦除', () => {
    const lin = buildArrivalMap('linear', 64, 36, { direction: 'down-right' });
    const diag = buildArrivalMap('diagonal', 64, 36, { direction: 'down-right' });
    expect(lin.levels[0]).toBe(0);
    expect(lin.levels[64 * 36 - 1]).toBe(255);
    expect(diag.levels[0]).toBe(0);
    expect(diag.levels[64 * 36 - 1]).toBe(255);
    /* 斜線擦除的等到達線平行於右上—左下的連線：右上角與左下角同時 */
    expect(Math.abs(diag.levels[63] - diag.levels[35 * 64])).toBeLessThanOrEqual(1);
    expect(lin.levels[63]).not.toBe(lin.levels[35 * 64]);
    const straight = buildArrivalMap('diagonal', 64, 36, { direction: 'up' });
    const plain = buildArrivalMap('linear', 64, 36, { direction: 'up' });
    expect(straight.levels).toEqual(plain.levels);
  });
});

/*
 * scene-transition 對等驗證後的修正：各形狀的到達先後照原作的公式（app.v6.js 的 buildField／realField）。
 * 下列數值是原作在 640 × 360 算出來的到達先後（同一組參數、同一個花紋編號），新版應逐值相同。
 */
describe('到達先後與原作逐值相同（對等修正）', () => {
  const PTS = [
    [0, 0],
    [100, 50],
    [320, 180],
    [500, 300],
    [639, 359],
    [37, 211],
    [411, 77],
  ] as const;
  const at = (
    shape: TransitionShape,
    p: ArrivalParams,
    pts: readonly (readonly [number, number])[] = PTS,
  ) => {
    const m = buildArrivalMap(shape, 640, 360, p);
    return pts.map(([x, y]) => m.levels[y * 640 + x]);
  };
  const column = (shape: TransitionShape, p: ArrivalParams, x: number, ys: number[]) => {
    const m = buildArrivalMap(shape, 640, 360, p);
    return ys.map((y) => m.levels[y * 640 + x]);
  };

  it('波浪邊：方波＝tanh(5·sin)；斜向的起伏與直向相同（F11、F13）', () => {
    expect(at('wave', { wave: 'square', direction: 'right', count: 5, strength: 100 })).toEqual([
      36, 31, 121, 212, 219, 13, 184,
    ]);
    expect(at('wave', { wave: 'sine', direction: 'down-right', count: 3, strength: 40 })).toEqual([
      1, 36, 128, 213, 254, 68, 121,
    ]);
    /*
     * 原作的公式：沿方向的位置＋強度 ÷ 100 × 0.15 × 波形（±1），八個方向都一樣（斜向沒有減半），
     * 依整張圖的最小、最大值正規化。逐像素比對（往左上、方波、5 波、強度 100；往右下、圓滑波）。
     */
    const reference = (d: Direction8, form: 'sine' | 'square', n: number, strength: number) => {
      const raw = new Float32Array(640 * 360);
      const sx = d.endsWith('left') ? -1 : 1;
      const sy = d.startsWith('up') ? -1 : 1;
      for (let y = 0, i = 0; y < 360; y++)
        for (let x = 0; x < 640; x++, i++) {
          const u = (x + 0.5) / 640;
          const v = (y + 0.5) / 360;
          const fx = sx > 0 ? u : 1 - u;
          const fy = sy > 0 ? v : 1 - v;
          const s = Math.sin(2 * Math.PI * n * ((fx - fy + 1) / 2));
          raw[i] =
            (fx + fy) / 2 + (strength / 100) * 0.15 * (form === 'square' ? Math.tanh(5 * s) : s);
        }
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of raw) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return Array.from(raw, (v) => Math.round(((v - lo) * 255) / (hi - lo)));
    };
    for (const [d, form, n, strength] of [
      ['up-left', 'square', 5, 100],
      ['down-right', 'sine', 3, 40],
    ] as const) {
      const m = buildArrivalMap('wave', 640, 360, { direction: d, wave: form, count: n, strength });
      const ref = reference(d, form, n, strength);
      let max = 0;
      for (let i = 0; i < ref.length; i++) max = Math.max(max, Math.abs(m.levels[i] - ref[i]));
      expect(max, `${d} ${form}`).toBeLessThanOrEqual(1);
    }
  });

  it('同心環、隔行掃描：奇數時依整張圖的最小、最大值正規化；線高不是整數時依像素中心分線（F15）', () => {
    expect(at('rings', { count: 3, center: [0.3, 0.5] })).toEqual([236, 50, 41, 105, 153, 50, 230]);
    expect(column('interlace', { count: 9 }, 0, [0, 39, 40, 80, 359])).toEqual([
      0, 15, 150, 30, 135,
    ]);
    expect(column('interlace', { count: 71 }, 0, [0, 5, 6, 10, 11, 359])).toEqual([
      0, 130, 131, 4, 4, 128,
    ]);
  });

  it('百葉窗：帶高不是整數時帶內位置＝(行 mod 帶高) ÷ 帶高；查表以實際的最大值為全程（F15）', () => {
    const v = buildArrivalMap('blinds', 640, 360, { axis: 'vertical', count: 7 });
    expect([0, 51, 52, 102, 103, 359].map((y) => v.levels[y * 640])).toEqual([
      0, 253, 3, 251, 1, 250,
    ]);
    expect(v.range).toEqual([0, 254]);
    const h = buildArrivalMap('blinds', 640, 360, { axis: 'horizontal', count: 25 });
    expect([0, 25, 26, 51, 52, 639].map((x) => h.levels[x])).toEqual([0, 249, 4, 253, 8, 245]);
    expect(h.range).toBeUndefined();
  });

  it('格子：格高不是整數（40 欄）時的交錯分組（F15）', () => {
    expect(
      at('grid', { cell: 'square', order: 'alternate', count: 40 }, [
        [0, 0],
        [17, 0],
        [8, 31],
        [639, 359],
        [320, 180],
      ]),
    ).toEqual([112, 239, 251, 240, 240]);
  });

  it('暈染：不規則程度＝強度 ÷ 100 × 0.6 ×（五層值雜訊 − 0.5），同一花紋編號與原作相同（F16、E36、E37）', () => {
    expect(at('ink', { spread: 'center', center: [0.5, 0.5], strength: 50, seed: 5 })).toEqual([
      246, 191, 0, 157, 255, 190, 80,
    ]);
    expect(at('ink', { spread: 'direction', direction: 'right', strength: 100, seed: 5 })).toEqual([
      21, 86, 120, 201, 245, 32, 132,
    ]);
    expect(at('ink', { spread: 'direction', direction: 'up', strength: 70, seed: 9 })).toEqual([
      247, 193, 137, 63, 1, 118, 202,
    ]);
    /* 往右、等速、柔和度 1、50% 時每列的邊界 x（p5～p95）：強度 25 → 315～334、100 → 215～389（原作） */
    const edges = (strength: number) => {
      const m = buildArrivalMap('ink', 640, 360, {
        spread: 'direction',
        direction: 'right',
        strength,
        seed: 5,
      });
      const lut = transitionLut({ progress: 0.5, softness: 1, color: '#000' });
      const xs: number[] = [];
      for (let y = 0; y < 360; y++) {
        let x = 0;
        while (x < 640 && lut.alpha[m.levels[y * 640 + x]] >= 128) x++;
        xs.push(x);
      }
      xs.sort((a, b) => a - b);
      return [xs[Math.round(0.05 * 359)], xs[Math.round(0.95 * 359)]];
    };
    expect(edges(25)).toEqual([315, 334]);
    expect(edges(100)).toEqual([215, 389]);
  });

  it('方塊溶解：每塊的到達先後同原作（同一花紋編號同花紋；查表以實際範圍為全程）', () => {
    expect(at('dissolve', { blockSize: 6, seed: 7 })).toEqual([2, 119, 73, 64, 48, 1, 225]);
    expect(at('dissolve', { blockSize: 24, seed: 3 })).toEqual([184, 119, 222, 155, 82, 206, 160]);
    expect(buildArrivalMap('dissolve', 640, 360, { blockSize: 24, seed: 3 }).range).toEqual([
      0, 254,
    ]);
    expect(at('dissolve', { blockSize: 16, seed: 5 })).toEqual([176, 164, 63, 196, 247, 77, 111]);
  });

  it('垂流：液滴與主前緣同原作（同一花紋編號相同的液滴）', () => {
    expect(at('drip', { count: 22, strength: 60, seed: 11 })).toEqual([
      55, 56, 128, 220, 255, 171, 62,
    ]);
    expect(at('drip', { count: 60, strength: 100, seed: 1234 })).toEqual([
      51, 63, 110, 146, 215, 186, 36,
    ]);
  });

  it('時鐘：中心在畫面邊上時，畫面裡實際的角度範圍佔滿整段（F19）', () => {
    expect(at('clock', { clock: 'clockwise', center: [0, 0] })).toEqual([
      128, 76, 83, 88, 83, 227, 30,
    ]);
    const m = buildArrivalMap('clock', 640, 360, { clock: 'clockwise', center: [0, 0] });
    expect(m.levels.reduce((a, b) => Math.min(a, b), 255)).toBe(0);
    expect(m.levels.reduce((a, b) => Math.max(a, b), 0)).toBe(255);
  });

  it('撕裂帶：前緣沿水平切成 14 段（同一條帶裡上下每一列相同），花紋同原作（E43）', () => {
    expect(at('tear', { count: 26, seed: 13 })).toEqual([64, 96, 63, 187, 9, 142, 109]);
    const m = buildArrivalMap('tear', 640, 360, { count: 26, seed: 13 });
    expect(Array.from(m.levels.subarray(0, 640))).toEqual(Array.from(m.levels.subarray(640, 1280)));
  });

  it('方塊雨：細縫以像素左緣判斷（格子 10 px 時每條格線 1 px）、花紋同原作（E44）', () => {
    expect(at('rain', { count: 48, seed: 21 })).toEqual([255, 103, 255, 117, 255, 161, 102]);
    const m = buildArrivalMap('rain', 480, 270, { count: 48, seed: 21 });
    const row = Array.from(m.levels.subarray(5 * 480, 6 * 480));
    /* 每格 10 px：x＝0、10、20… 是細縫（最後才蓋上），x＝9、19… 不是 */
    expect(row.filter((L) => L === 255).length).toBe(48);
    expect(row[10]).toBe(255);
    expect(row[9]).not.toBe(255);
    expect(row[19]).not.toBe(255);
  });

  it('兩側合攏、旋轉合攏、六角格、橢圓：同原作；兩側合攏偶數行時範圍 0～254', () => {
    const s = buildArrivalMap('split', 640, 360, { axis: 'vertical' });
    expect(column('split', { axis: 'vertical' }, 5, [0, 179, 180, 359, 90])).toEqual([
      0, 254, 254, 0, 128,
    ]);
    expect(s.range).toEqual([0, 254]);
    expect(at('rotate', { angle: Math.PI / 2 })).toEqual([0, 80, 255, 111, 0, 30, 182]);
    expect(at('hex', { count: 14, order: 'center', center: [0.5, 0.5] })).toEqual([
      153, 141, 14, 125, 191, 215, 60,
    ]);
    expect(at('circle', { ellipse: true, center: [0.2, 0.8] })).toEqual([
      186, 149, 96, 131, 185, 58, 165,
    ]);
  });

  it('查表的範圍：過渡帶從範圍的最小值之前走到最大值之後（同原作 lo + t ×（hi − lo + 柔和度））', () => {
    const range = [0, 254] as const;
    const look = { softness: 30, color: '#000' };
    expect(coverAmount(254, { ...look, progress: 0 }, false, range)).toBe(0);
    expect(coverAmount(254, { ...look, progress: 1 }, false, range)).toBe(1);
    expect(coverAmount(127, { ...look, progress: 0.5 }, false, range)).toBeCloseTo(
      (0.5 * 284 - 127) / 30,
      10,
    );
    /* 反向順序：每一階換成 255 − 階，範圍跟著換成 [1, 255] */
    expect(coverAmount(127, { ...look, progress: 0.5, reverse: true }, false, range)).toBeCloseTo(
      (1 + 0.5 * 284 - 128) / 30,
      10,
    );
    /* 不給範圍時同 [0, 255]（向下相容） */
    expect(coverAmount(100, { ...look, progress: 0.4 })).toBeCloseTo((0.4 * 285 - 100) / 30, 10);
  });

  it('邊緣實心只在有邊緣發光時作用：沒有發光時與一般的蓋上相同（F05）', () => {
    const map = buildArrivalMap('split', 640, 360, { axis: 'vertical' });
    const look = { progress: getCurve('quadIn')(1) * 0.96, softness: 30, color: '#0c0618' };
    const plain = renderTransition(map, look);
    const solid = renderTransition(map, { ...look, solidEdge: true });
    expect(solid).toEqual(plain);
    /* 原作（E49 關掉發光，640 × 360 最後一格，x＝320）：合攏處是半透明的縫 */
    const ys = [170, 176, 178, 179, 180, 181, 184, 190];
    expect(ys.map((y) => solid[(y * 640 + 320) * 4 + 3])).toEqual([
      255, 192, 167, 158, 158, 167, 201, 255,
    ]);
    /* 有發光時：合攏處是不透明的亮線（原作的數值） */
    const glow = renderTransition(map, { ...look, glow: '#f3eaff', solidEdge: true });
    expect(
      ys.map((y) => Array.from(glow.slice((y * 640 + 320) * 4, (y * 640 + 320) * 4 + 4))),
    ).toEqual([
      [12, 6, 24, 255],
      [174, 166, 186, 255],
      [216, 207, 228, 255],
      [227, 218, 239, 255],
      [227, 218, 239, 255],
      [216, 207, 228, 255],
      [154, 146, 166, 255],
      [12, 6, 24, 255],
    ]);
  });
});
