/**
 * 場景轉換素材產生器：設定 → 影格表 → 畫面（純函式）。以附件 scene-transition.effects.json（舊版量測）驗證：
 * - 每個效果在初始設定下、640 × 360 的 25／50／75% 區塊平均透明度與九點 RGBA（量測條件：每秒 10 格、動作 10.1 秒、
 *   停留 0、不倒著播放、沒有字幕）；隨機效果比對覆蓋率曲線與比例（規格 3.10）；
 * - 影格時間軸（規格 3.2）：影格數、每格延遲、停留、來回、倒著播放、相同影格合併（合併後才四捨五入），
 *   以附件「匯出」欄的影格數、總長、第一格／最後一格延遲比對（預覽解析度 480 × 270 與匯出相同）；
 * - 字幕的淡入淡出（3.7.4）、雙色閃換（3.5.3）、旋轉合攏的角度（3.6）、字幕疊合。
 */
import { describe, expect, it } from 'vitest';
import { exportTransition } from '@/tools/scene-transition/exporter';
import { applyEffect, DEFAULT_SETTINGS, exportFileName } from '@/tools/scene-transition/model';
import {
  type CaptionLayer,
  captionAlpha,
  captionLayerFrom,
  compositeCaption,
  framesOf,
  mergeRuns,
  planOf,
  renderFrame,
  rotateAngle,
  runDelayMs,
} from '@/tools/scene-transition/render';
import type { Fps, Settings } from '@/tools/scene-transition/settings';
import EFFECTS from '../../../docs/refactor/specs/scene-transition.effects.json';
import { composeApng, parseApng } from '../helpers/png';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON 的欄位依效果不同
type Effect = any;
const J = EFFECTS as unknown as { 效果: Effect[] };

const RANDOM = new Set(['E30', 'E31', 'E35', 'E36', 'E37', 'E43', 'E44', 'E47']);
/* 區塊平均透明度的容許差：多數 ≤ 3；圖形（心形、菱形的輪廓取樣）、時鐘、六角格、同心環、旋轉合攏的邊界與舊版略有不同 */
const BLOCK_TOL: Record<string, number> = {
  E16: 4,
  E26: 4,
  E27: 7,
  E28: 8,
  E46: 5,
  E51: 5,
  E53: 5,
};

/** 附件的初始設定（E52 量測時是舊版的 88%；新版改成 100%，見主控裁定） */
function initial(id: string): Settings {
  const s = applyEffect(null, id);
  return id === 'E52' ? { ...s, reach: 88 } : s;
}

/** 附件的量測條件：640 × 360、每秒 10 格、動作 10.1 秒（第 k 格＝k%）、停留 0、不倒著播放、沒有字幕 */
function measurePlan(id: string) {
  const s: Settings = {
    ...initial(id),
    size: '640x360',
    fps: 10 as Fps,
    duration: 10.1,
    hold: 0,
    reversePlay: false,
    caption: '',
  };
  return planOf(s, 640, 360, 1);
}

function renderAt(id: string, pct: number): Uint8ClampedArray {
  const plan = measurePlan(id);
  const out = new Uint8ClampedArray(640 * 360 * 4);
  renderFrame(plan, plan.frames[pct], null, out);
  return out;
}

const grid = (v: unknown): number[][] =>
  Array.isArray(v)
    ? v.map((r: string) => r.split(' ').map(Number))
    : Array.from({ length: 9 }, () => Array(16).fill(Number(String(v).replace('全部 ', ''))));

const NINE = [
  [0, 0],
  [320, 0],
  [639, 0],
  [0, 180],
  [320, 180],
  [639, 180],
  [0, 359],
  [320, 359],
  [639, 359],
];

describe('各效果的畫面（附件的區塊透明度與九點 RGBA）', () => {
  for (const e of J.效果 as Effect[]) {
    if (RANDOM.has(e.編號)) continue;
    it(`${e.編號} ${e.名稱}`, () => {
      let bmax = 0;
      for (const pct of [25, 50, 75]) {
        const ref = e.量測.取樣[`${pct}%`];
        const px = renderAt(e.編號, pct);
        const blocks = grid(ref['16×9 區塊平均透明度']);
        for (let j = 0; j < 9; j++)
          for (let i = 0; i < 16; i++) {
            let sum = 0;
            for (let y = 0; y < 40; y++)
              for (let x = 0; x < 40; x++) sum += px[((j * 40 + y) * 640 + i * 40 + x) * 4 + 3];
            bmax = Math.max(bmax, Math.abs(Math.round(sum / 1600) - blocks[j][i]));
          }
        /*
         * 九點：透明度相差 ≤ 3＋到達先後差一階造成的差（255 ÷ 柔和度；邊界上的點才會差到）；
         * 形狀的輪廓與舊版略有不同的效果，邊界上的點容許區塊差的 4 倍。看得見時再比顏色。
         */
        const tol = BLOCK_TOL[e.編號] ?? 3;
        const levelTol = 3 + Math.ceil(255 / initial(e.編號).softness);
        (ref.九點RGBA as string[]).forEach((want, k) => {
          const [x, y] = NINE[k];
          const o = (y * 640 + x) * 4;
          const w = want.split(',').map(Number);
          const got = Array.from(px.slice(o, o + 4));
          const near = Math.abs(got[3] - w[3]) <= Math.max(levelTol, tol * 4);
          expect(near, `${pct}% 點 ${k}（${x},${y}）透明度 ${got} vs ${want}`).toBe(true);
          if (w[3] >= 32 && got[3] >= 32 && Math.abs(got[3] - w[3]) <= 3)
            for (let c = 0; c < 3; c++)
              expect(
                Math.abs(got[c] - w[c]),
                `${pct}% 點 ${k} RGB ${got} vs ${want}`,
              ).toBeLessThanOrEqual(6);
        });
      }
      expect(bmax, '區塊平均透明度').toBeLessThanOrEqual(BLOCK_TOL[e.編號] ?? 3);
    });
  }
});

describe('隨機效果（統計比對，規格 3.10）', () => {
  for (const id of RANDOM) {
    const e = (J.效果 as Effect[]).find((x) => x.編號 === id);
    it(`${id} ${e.名稱}：覆蓋率曲線與 50% 時的比例`, () => {
      const plan = measurePlan(id);
      const ref: number[] = e.量測['覆蓋率曲線（0～100%，每 5%）'];
      const out = new Uint8ClampedArray(640 * 360 * 4);
      let cmax = 0;
      for (let k = 0; k <= 20; k++) {
        renderFrame(plan, plan.frames[k * 5], null, out);
        let sum = 0;
        let op = 0;
        let tr = 0;
        for (let i = 3; i < out.length; i += 4) {
          sum += out[i];
          if (out[i] >= 250) op++;
          else if (out[i] <= 5) tr++;
        }
        const n = out.length / 4;
        cmax = Math.max(cmax, Math.abs(sum / n / 255 - ref[k]));
        if (k === 10) {
          const r = e.量測.取樣['50%'];
          expect(Math.abs(op / n - r.不透明比例)).toBeLessThanOrEqual(0.08);
          expect(Math.abs(tr / n - r.透明比例)).toBeLessThanOrEqual(0.08);
        }
      }
      expect(cmax).toBeLessThanOrEqual(0.08);
    });
  }
});

describe('影格時間軸（規格 3.2）', () => {
  it('影格數＝動作時間 × 每秒格數四捨五入、至少 2；每格 1000 ÷ fps；停留加在最後一格', () => {
    const base = { hold: 0, mode: 'cover' as const, reversePlay: false };
    expect(framesOf({ ...base, duration: 0.7, fps: 24 })).toHaveLength(17);
    expect(framesOf({ ...base, duration: 0.55, fps: 24 })).toHaveLength(13);
    expect(framesOf({ ...base, duration: 0.35, fps: 24 })).toHaveLength(8);
    expect(framesOf({ ...base, duration: 0.1, fps: 12 })).toHaveLength(2);
    const f = framesOf({ ...base, duration: 0.7, fps: 24, hold: 0.6 });
    expect(f[0].ms).toBeCloseTo(1000 / 24, 6);
    expect(f[16].ms).toBeCloseTo(1000 / 24 + 600, 6);
    expect(f.map((x) => x.progress)).toEqual(Array.from({ length: 17 }, (_, i) => i / 16));
  });

  it('蓋上再揭開：去程 n 格（最後一格停留）＋回程 n − 1 格（不重複終點）；倒著播放停留移到第一格', () => {
    const rt = framesOf({
      duration: 0.6,
      fps: 24,
      hold: 0.8,
      mode: 'roundtrip',
      reversePlay: false,
    });
    expect(rt).toHaveLength(2 * 14 - 1);
    expect(rt[13].ms).toBeCloseTo(1000 / 24 + 800, 6);
    expect(rt[14].leg).toBe('back');
    expect(rt[14].progress).toBeCloseTo(12 / 13, 9);
    expect(rt[26].progress).toBe(0);
    const rev = framesOf({ duration: 0.7, fps: 24, hold: 0.6, mode: 'cover', reversePlay: true });
    expect(rev[0].ms).toBeCloseTo(1000 / 24 + 600, 6);
    expect(rev[0].progress).toBe(1);
    expect(rev[16].progress).toBe(0);
  });

  it('附件「匯出」欄：每個效果的影格數（合併後）、總長、第一格與最後一格的延遲', () => {
    /* 字幕效果另外驗證（字幕的淡入淡出會影響合併）；E52 刻意改成完全蓋上（主控裁定） */
    const skip = new Set(['E40', 'E41', 'E42', 'E48', 'E52']);
    const bad: string[] = [];
    for (const e of J.效果 as Effect[]) {
      if (skip.has(e.編號)) continue;
      const want = e['匯出（1280×720、24 fps、初始設定）'];
      const plan = planOf(initial(e.編號), 480, 270, 480 / 1280);
      const runs = mergeRuns(plan, null);
      const ms = runs.map(runDelayMs);
      const total = ms.reduce((a, b) => a + b, 0);
      const got = [runs.length, total, ms[0], ms[ms.length - 1]];
      const exp = [want.影格數, want.總長毫秒, want.第一格延遲毫秒, want.最後一格延遲毫秒];
      if (got.join() !== exp.join()) bad.push(`${e.編號}: ${got} ≠ ${exp}`);
    }
    expect(bad).toEqual([]);
  });

  it('只有字幕（E42）：開頭 4 格合成 167 ms、回程最後 7 格合成 292 ms、共 9 格 2961 ms', () => {
    const s = applyEffect(null, 'E42');
    const plan = planOf(s, 48, 27, 1);
    /* 字幕圖層：中間一塊白色（真正的字由瀏覽器畫，這裡只看淡入淡出造成的合併） */
    const rgba = new Uint8ClampedArray(48 * 27 * 4);
    for (let y = 20; y < 24; y++)
      for (let x = 10; x < 38; x++) rgba.set([255, 255, 255, 255], (y * 48 + x) * 4);
    const runs = mergeRuns(plan, captionLayerFrom(rgba));
    const ms = runs.map(runDelayMs);
    expect(runs).toHaveLength(9);
    expect(ms[0]).toBe(167);
    expect(ms[ms.length - 1]).toBe(292);
    expect(ms.reduce((a, b) => a + b, 0)).toBe(2961);
  });

  it('E52 黑白輪閃（刻意差異）：白黑交替後最後一格是完全不透明的黑色', () => {
    const plan = planOf(applyEffect(null, 'E52'), 48, 27, 1);
    const out = new Uint8ClampedArray(48 * 27 * 4);
    renderFrame(plan, plan.frames[plan.frames.length - 1], null, out);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 255]);
    /* 前段是白色 */
    renderFrame(plan, plan.frames[5], null, out);
    expect(Array.from(out.slice(0, 3))).toEqual([255, 255, 255]);
  });
});

describe('蓋上再揭開的回程與匯出（APNG，Node 上以共用編碼器實際編碼）', () => {
  it('E06 回程覆蓋率曲線（回程 0～100%，每 5%）', () => {
    const s: Settings = { ...initial('E06'), fps: 10 as Fps, duration: 10.1, hold: 0 };
    const plan = planOf(s, 64, 36, 1);
    expect(plan.frames).toHaveLength(201);
    const ref: number[] = (J.效果 as Effect[]).find((x) => x.編號 === 'E06').量測[
      '回程覆蓋率曲線（回程 0～100%，每 5%）'
    ];
    const out = new Uint8ClampedArray(64 * 36 * 4);
    ref.forEach((want, k) => {
      renderFrame(plan, plan.frames[100 + k * 5], null, out);
      expect(Math.abs(out[3] / 255 - want), `${k * 5}%`).toBeLessThanOrEqual(0.005);
    });
  });

  it('APNG：影格數、每格延遲（合併後才四捨五入）、播放次數、尺寸（E01、E07、E08、E50、E39）', async () => {
    for (const [id, want] of [
      ['E01', { n: 17, first: 42, last: 642, total: 1314, plays: 1 }],
      ['E07', { n: 19, first: 42, last: 250, total: 1006, plays: 1 }],
      ['E08', { n: 23, first: 125, last: 642, total: 2022, plays: 1 }],
      ['E50', { n: 8, first: 42, last: 42, total: 336, plays: 1 }],
      ['E39', { n: 13, first: 42, last: 542, total: 1087, plays: 0 }],
    ] as const) {
      const s = { ...applyEffect(null, id), size: '640x360' as const };
      const r = await exportTransition(s, 'apng', { worker: false });
      const info = parseApng(new Uint8Array(await r.blob.arrayBuffer()));
      const delays = info.frames.map((f) => Math.round((f.delayNum * 1000) / (f.delayDen || 100)));
      expect(info.ihdr.width).toBe(640);
      expect(info.ihdr.height).toBe(360);
      expect(info.ihdr.colorType).toBe(6);
      expect(info.numFrames, id).toBe(want.n);
      expect(info.numPlays, id).toBe(want.plays);
      expect(delays[0], id).toBe(want.first);
      expect(delays[delays.length - 1], id).toBe(want.last);
      expect(
        delays.reduce((a, b) => a + b, 0),
        id,
      ).toBe(want.total);
      expect(r.storedFrames).toBe(want.n);
      expect(r.durationMs).toBe(want.total);
      expect(r.fileName).toBe(exportFileName(s, 'png'));
    }
  });

  it('APNG：解碼後的最後一格與預覽的畫面相同（E24 圓形收束、1280 × 720 的檔案大小不超過舊版的 1.5 倍）', async () => {
    const s = applyEffect(null, 'E24');
    const r = await exportTransition(s, 'apng', { worker: false });
    const bytes = new Uint8Array(await r.blob.arrayBuffer());
    const ref = (J.效果 as Effect[]).find((x) => x.編號 === 'E24')[
      '匯出（1280×720、24 fps、初始設定）'
    ];
    expect(bytes.length / 1024).toBeLessThanOrEqual(ref['APNG 約 KB'] * 1.5);
    const frames = composeApng(parseApng(bytes));
    const plan = planOf(s, 1280, 720, 1);
    const out = new Uint8ClampedArray(1280 * 720 * 4);
    renderFrame(plan, plan.frames[plan.frames.length - 1], null, out);
    const last = frames[frames.length - 1];
    let diff = 0;
    for (let i = 0; i < out.length; i++) if (last[i] !== out[i]) diff++;
    expect(last.length).toBe(out.length);
    expect(diff).toBe(0);
  });
});

describe('字幕、雙色閃換、旋轉合攏', () => {
  it('字幕的不透明度只看時間進度（規格 3.7.4）', () => {
    const go = (p: number) => captionAlpha('cover', { progress: p, leg: 'go' });
    expect(go(0.34)).toBe(0);
    expect(go(0.35)).toBe(0);
    expect(go(0.475)).toBe(128);
    expect(go(0.6)).toBe(255);
    expect(go(1)).toBe(255);
    const rv = (p: number) => captionAlpha('reveal', { progress: p, leg: 'go' });
    expect(rv(0.15)).toBe(255);
    expect(rv(0.275)).toBe(128);
    expect(rv(0.4)).toBe(0);
    /* 回程：時間進度 0.85 以上全不透明、0.6 以下看不到 */
    const back = (p: number) => captionAlpha('roundtrip', { progress: p, leg: 'back' });
    expect(back(0.9)).toBe(255);
    expect(back(0.85)).toBe(255);
    expect(back(0.725)).toBe(128);
    expect(back(0.6)).toBe(0);
    /* 掃過、蓋上再揭開的去程與蓋上相同 */
    expect(captionAlpha('sweep', { progress: 0.5, leg: 'go' })).toBe(go(0.5));
  });

  it('字幕疊合：一般的透明疊合（透明的地方字幕照樣看得到）', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    const layer: CaptionLayer = captionLayerFrom(rgba);
    expect(Array.from(layer.pixels)).toEqual([0]);
    const out = new Uint8ClampedArray([0, 0, 0, 0, 10, 20, 30, 40]);
    compositeCaption(out, layer, 255);
    expect(Array.from(out)).toEqual([255, 255, 255, 255, 10, 20, 30, 40]);
    const half = new Uint8ClampedArray([0, 0, 0, 255]);
    compositeCaption(half, layer, 128);
    expect(Array.from(half)).toEqual([128, 128, 128, 255]);
  });

  it('雙色閃換：前 75% 時間輪流用顏色與第二顏色（N＝4），不受速度曲線影響', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      color: '#ffffff',
      color2: '#000000',
      strobe: 4,
      curve: 'bounceOut',
      duration: 10.1,
      fps: 10 as Fps,
    };
    const plan = planOf(s, 4, 4, 1);
    const colors = plan.frames.map((f) => plan.look(f).color);
    expect(colors.slice(0, 19).every((c) => c === '#ffffff')).toBe(true);
    expect(colors.slice(19, 38).every((c) => c === '#000000')).toBe(true);
    expect(colors.slice(38, 57).every((c) => c === '#ffffff')).toBe(true);
    expect(colors.slice(57).every((c) => c === '#000000')).toBe(true);
    /* 1 次：整段都是顏色 */
    const one = planOf({ ...s, strobe: 1 }, 4, 4, 1);
    expect(one.frames.every((f) => one.look(f).color === '#ffffff')).toBe(true);
  });

  it('旋轉合攏：強度 50、等速時 60% 轉 108°；回程繼續往同方向轉（回到起點時 360°）', () => {
    const deg = (rad: number) => Math.round((rad * 180) / Math.PI);
    expect(deg(rotateAngle(50, 0.6, 'go'))).toBe(108);
    expect(deg(rotateAngle(50, 0.9, 'go'))).toBe(162);
    expect(deg(rotateAngle(50, 0.9, 'back'))).toBe(198);
    expect(deg(rotateAngle(50, 0, 'back'))).toBe(360);
    expect(deg(rotateAngle(100, 1, 'go'))).toBe(360);
  });

  it('預覽：方塊大小依 480 寬等比縮小（四捨五入、至少 1 px）', () => {
    const s = applyEffect(null, 'E31');
    expect(planOf(s, 480, 270, 480 / 1280).params.blockSize).toBe(9);
    expect(planOf({ ...s, blockSize: 1 }, 480, 270, 480 / 1920).params.blockSize).toBe(1);
    expect(planOf(s, 1280, 720, 1).params.blockSize).toBe(24);
  });
});
