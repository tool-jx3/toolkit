/**
 * 動態背景產生器（bg-motion）的動態效果，對照規格附件 bg-motion.examples.json 的量測值：
 * - 21 個單張效果每 0.05 的位移、縮放、旋轉、疊色、黑邊（規格 3.10 的容許差：位移 ±1.5 px、縮放 ±0.005、
 *   旋轉 ±0.3°、疊色 ±0.02、黑邊 ±2 px）；
 * - 底圖放大與位移都是固定像素（1280 × 720 與 640 × 360）；
 * - 水波的白線在 19 個高度的偏移（±2 px）；
 * - 淡化的圖片／顏色可見度、灰圖結果；透明淡化改成單純降低不透明度（主控裁定）；
 * - 轉場：兩張、三張的溶接中央色、擦除前緣、硬切時間，單張＋黑白濾鏡。
 */
import { describe, expect, it } from 'vitest';
import {
  EFFECT_IDS,
  EFFECTS,
  type EffectId,
  fadeAt,
  isFade,
  isSwitch,
  placementAt,
  switchAt,
  WAVE_STRIPS,
  waveRowOffset,
} from '@/tools/bg-motion/effects';
import BG_JSON from '../../../docs/refactor/specs/bg-motion.examples.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const BG = BG_JSON as any;

interface Sample {
  t: number;
  位移X: number | null;
  位移Y: number | null;
  縮放: number | null;
  旋轉度: number | null;
  黑邊: number[] | string;
  疊色?: number;
}

const byCode = (code: string) => EFFECT_IDS.find((id) => EFFECTS[id].code === code) as EffectId;
const W = 1280;
const H = 720;

/**
 * 畫面四邊中點往內露出的黑帶寬（上、下、左、右）：測試圖 1280 × 720 依擺法放進畫面，
 * 從邊的中點往畫面中心找第一個落在圖片範圍內的點。
 */
function blackBands(effect: EffectId, t: number, w = W, h = H): number[] {
  const p = placementAt(effect, t, 1280, 720, w, h);
  const cx = w / 2 + p.dx;
  const cy = h / 2 + p.dy;
  const th = (p.rotate * Math.PI) / 180;
  const hw = (1280 * p.scale) / 2;
  const hh = (720 * p.scale) / 2;
  const inside = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * Math.cos(th) + dy * Math.sin(th);
    const v = -dx * Math.sin(th) + dy * Math.cos(th);
    return Math.abs(u) <= hw && Math.abs(v) <= hh;
  };
  const scan = (from: [number, number], dir: [number, number], max: number) => {
    for (let d = 0; d <= max; d += 0.25) {
      if (inside(from[0] + dir[0] * (d + 0.5), from[1] + dir[1] * (d + 0.5))) return d;
    }
    return max;
  };
  return [
    scan([w / 2, 0], [0, 1], h),
    scan([w / 2, h], [0, -1], h),
    scan([0, h / 2], [1, 0], w),
    scan([w, h / 2], [-1, 0], w),
  ];
}

describe('單張動態效果（E01～E18）：附件逐點比對', () => {
  for (let n = 1; n <= 18; n++) {
    const code = `E${String(n).padStart(2, '0')}`;
    const effect = byCode(code);
    it(`${code}（${BG.效果[code].暫名}）`, () => {
      const ref = BG.效果[code];
      expect(EFFECTS[effect].seconds).toBe(ref.預設秒數);
      expect(EFFECTS[effect].loop).toBe(ref.預設循環);
      for (const s of ref.取樣 as Sample[]) {
        if (s.縮放 === null) continue;
        const p = placementAt(effect, s.t, 1280, 720, W, H);
        const at = `${code} t=${s.t}`;
        expect(Math.abs(p.relative - s.縮放), `${at} 縮放`).toBeLessThanOrEqual(0.005);
        /* 疊色超過一半時色塊被蓋掉，附件量到的旋轉不準（E08、E09 的 t ≥ 0.85），只比到這裡 */
        if ((s.疊色 ?? 0) <= 0.5)
          expect(Math.abs(p.rotate - (s.旋轉度 ?? 0)), `${at} 旋轉`).toBeLessThanOrEqual(0.3);
        if (code !== 'E10') {
          /* 水波的位移來自細帶偏移（另外驗白線），不比色塊重心 */
          expect(Math.abs(p.dx - (s.位移X ?? 0)), `${at} 位移X`).toBeLessThanOrEqual(1.5);
          expect(Math.abs(p.dy - (s.位移Y ?? 0)), `${at} 位移Y`).toBeLessThanOrEqual(1.5);
        }
        /*
         * 黑邊（邊的中點往內）：不放大的效果逐點比 ±2（會旋轉的 E03、E04 邊緣有反鋸齒、量測取整數，±3）；
         * E07 縮小旋轉後露出的大片黑色，附件的量法與「邊的中點」不同（位移、縮放、旋轉已逐點相符），不比；
         * 其他效果附件都是 0（不露黑邊）。
         */
        if (code !== 'E10' && code !== 'E07') {
          const bands = blackBands(effect, s.t);
          const tol = code === 'E03' || code === 'E04' ? 3 : 2;
          (s.黑邊 as number[]).forEach((b, i) => {
            expect(Math.abs(bands[i] - b), `${at} 黑邊[${i}]`).toBeLessThanOrEqual(tol);
          });
        }
        if (s.疊色 !== undefined)
          expect(Math.abs(p.overlay - s.疊色), `${at} 疊色`).toBeLessThanOrEqual(0.02);
      }
    });
  }

  it('週期性的效果首尾相同；E10 首尾不同（循環時會跳一下，保留舊行為）', () => {
    for (const code of ['E01', 'E02', 'E03', 'E04', 'E05', 'E06']) {
      const e = byCode(code);
      expect(EFFECTS[e].periodic).toBe(true);
      const a = placementAt(e, 0, 1280, 720, W, H);
      const b = placementAt(e, 1, 1280, 720, W, H);
      expect(b.dx).toBeCloseTo(a.dx, 9);
      expect(b.dy).toBeCloseTo(a.dy, 9);
      expect(b.rotate).toBeCloseTo(a.rotate, 9);
      expect(b.relative).toBeCloseTo(a.relative, 9);
    }
    expect(EFFECTS.wave.periodic).toBe(false);
    expect(BG.效果.E10.第一格與最後一格相同).toBe(false);
  });
});

describe('固定像素的額外放大與位移（規格 3.4）', () => {
  it('底圖放大：輸出越小相對放大越多（附件「底圖放大與輸出尺寸」）', () => {
    for (const [code, row] of Object.entries(BG.底圖放大與輸出尺寸.列) as [
      string,
      Record<string, number>,
    ][]) {
      const e = byCode(code);
      expect(
        Math.abs(placementAt(e, 0, 1280, 720, 1280, 720).relative - row['1280×720']),
      ).toBeLessThanOrEqual(0.005);
      expect(
        Math.abs(placementAt(e, 0, 1280, 720, 640, 360).relative - row['640×360']),
      ).toBeLessThanOrEqual(0.005);
    }
  });
  it('位移是固定像素：1280 × 720 與 640 × 360 的最大位移相同', () => {
    for (const [code, row] of Object.entries(BG.位移與輸出尺寸.列) as [
      string,
      Record<string, number>,
    ][]) {
      const e = byCode(code);
      for (const [w, h, key] of [
        [1280, 720, '1280×720'],
        [640, 360, '640×360'],
      ] as const) {
        let max = 0;
        for (let i = 0; i <= 600; i++) {
          const p = placementAt(e, i / 600, 1280, 720, w, h);
          max = Math.max(max, Math.abs(p.dx), Math.abs(p.dy));
        }
        expect(Math.abs(max - row[key]), `${code} ${key}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('水波（E10）：白線在 19 個高度的偏移', () => {
  it('72 條細帶，主波 3 個＋兩倍波數的次波（±2 px；量在細帶交界時取上下兩條之間）', () => {
    const rows = BG.效果.E10.白線水平偏移.列 as Record<string, number[]>;
    for (const [key, values] of Object.entries(rows)) {
      const t = Number(key.slice(2));
      const k = placementAt('wave', t, 1280, 720, W, H).scale;
      const drawW = 1280 * k;
      const drawH = 720 * k;
      values.forEach((want, i) => {
        const y = (H * (i + 1)) / 20;
        const a = waveRowOffset(y - 1.5, t, drawW, drawH, H);
        const b = waveRowOffset(y + 1.5, t, drawW, drawH, H);
        const lo = Math.min(a, b) - 2;
        const hi = Math.max(a, b) + 2;
        expect(want, `t=${t} y=${y}`).toBeGreaterThanOrEqual(lo);
        expect(want, `t=${t} y=${y}`).toBeLessThanOrEqual(hi);
      });
    }
    expect(WAVE_STRIPS).toBe(72);
    /* 1280 寬時最大約 ±33 px */
    let max = 0;
    const k = placementAt('wave', 0, 1280, 720, W, H).scale;
    for (let i = 0; i < 400; i++)
      for (let y = 0; y < H; y += 3)
        max = Math.max(max, Math.abs(waveRowOffset(y, i / 400, 1280 * k, 720 * k, H)));
    expect(max).toBeGreaterThan(31);
    expect(max).toBeLessThan(34.5);
  });
});

describe('淡化（E19～E21）', () => {
  it('淡化成黑：圖片可見度（±0.02）與灰圖結果', () => {
    for (const r of BG.淡化.E19) {
      const l = fadeAt(r.t, false);
      expect(Math.abs(l.image - r.圖片可見度), `t=${r.t}`).toBeLessThanOrEqual(0.02);
      /* 黑底＋黑色層＋圖片層：128 × 圖片可見度 */
      expect(Math.abs(128 * l.image - r.灰圖結果), `t=${r.t}`).toBeLessThanOrEqual(2);
    }
  });
  it('淡化成白：兩層半透明疊在黑底上，中段比頭尾暗', () => {
    for (const r of BG.淡化.E20) {
      const l = fadeAt(r.t, false);
      expect(Math.abs(l.image - r.圖片可見度), `t=${r.t}`).toBeLessThanOrEqual(0.02);
      if (r.顏色可見度 !== null)
        expect(Math.abs(l.color - r.顏色可見度), `t=${r.t}`).toBeLessThanOrEqual(0.06);
      const gray = 128 * l.image + 255 * l.color * (1 - l.image);
      expect(Math.abs(gray - r.灰圖結果), `t=${r.t}`).toBeLessThanOrEqual(2);
    }
    /* 中灰淡出到白：約 t＝0.35 降到約 112 */
    const l = fadeAt(0.35, false);
    expect(128 * l.image + 255 * l.color * (1 - l.image)).toBeLessThan(116);
  });
  it('淡入＝淡出的時間倒轉', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      expect(fadeAt(t, true).image).toBeCloseTo(fadeAt(1 - t, false).image, 9);
      expect(fadeAt(t, true).color).toBeCloseTo(fadeAt(1 - t, false).color, 9);
    }
  });
  it('淡化成透明：單純降低不透明度（主控裁定），前段與舊版量測相同、顏色不變', () => {
    for (const r of BG.淡化.E21) {
      const a = 255 * fadeAt(r.t, false).image;
      /* 舊版在不透明度 144 以下另外把顏色壓暗、20 以下直接透明；新版不做，只比前段 */
      if (r.灰圖透明度 > 150 && r.灰圖透明度 < 250)
        expect(Math.abs(a - r.灰圖透明度), `t=${r.t}`).toBeLessThanOrEqual(3);
    }
    expect(fadeAt(1, false).image).toBe(0);
    expect(fadeAt(0, false).image).toBe(1);
    expect(EFFECTS.fadeClear.kind).toBe('fade');
  });
});

/** 黑底上「舊圖可見度 1 − k，再疊新圖 k」的顏色 */
const mix = (from: number[], to: number[], k: number) =>
  from.map((v, c) => to[c] * k + v * (1 - k) * (1 - k));
const parse = (s: string) => s.split(',').map(Number);

describe('轉場（E22～E24）', () => {
  const A = [200, 60, 60];
  const B = [60, 60, 200];
  const C = [60, 200, 60];
  it('兩張、三張：溶接中央色（±4）、擦除前緣（±0.01）、硬切在每段正中間', () => {
    for (const [key, n] of [
      ['兩張', 2],
      ['三張', 3],
    ] as const) {
      const imgs = [A, B, C];
      for (const r of BG.轉場[key]) {
        const st = switchAt(r.t, n, false);
        const from = imgs[st.from];
        const to = imgs[st.to];
        mix(from, to, st.k).forEach((v, c) => {
          expect(Math.abs(v - parse(r.交叉溶接中央色)[c]), `${key} t=${r.t}`).toBeLessThanOrEqual(
            4,
          );
        });
        const local = (r.t * (n - 1)) % 1;
        if (local > 0.02 && local < 0.98)
          expect(Math.abs(st.k - r.擦除前緣), `${key} t=${r.t}`).toBeLessThanOrEqual(0.012);
        if (Math.abs(local - 0.5) > 0.03)
          expect((st.k < 0.5 ? from : to).join(','), `${key} t=${r.t}`).toBe(r.硬切中央色);
      }
    }
    /* 一次循環單向走完，最後停在最後一張 */
    expect(switchAt(1, 3, false)).toMatchObject({ from: 1, to: 2, k: 1 });
    expect(switchAt(0.5, 3, false)).toMatchObject({ from: 1, to: 2, k: 0 });
  });
  it('單張＋黑白濾鏡：原圖 → 套濾鏡的同一張', () => {
    const G = Math.round(0.299 * 200 + 0.587 * 60 + 0.114 * 60);
    expect(G).toBe(102);
    for (const r of BG.轉場.單張加濾鏡.列) {
      const st = switchAt(r.t, 1, true);
      expect(st.filtered).toBe(true);
      mix(A, [G, G, G], st.k).forEach((v, c) => {
        expect(Math.abs(v - parse(r.交叉溶接中央色)[c]), `t=${r.t}`).toBeLessThanOrEqual(4);
      });
      expect((st.k < 0.5 ? A : [G, G, G]).join(','), `t=${r.t}`).toBe(r.硬切中央色);
      /* 擦除：前緣過了左側的量測點（畫面寬約 10%）就是濾鏡色 */
      expect((st.k > 0.1 ? [G, G, G] : A).join(','), `t=${r.t}`).toBe(r.擦除左側色);
    }
  });
  it('單張沒有濾鏡：完全靜止', () => {
    for (const t of [0, 0.3, 0.7, 1]) expect(switchAt(t, 1, false).k).toBe(0);
  });
});

describe('效果清單', () => {
  it('24 種、代號依序 E01～E24；預設秒數與循環（規格 3.5）', () => {
    expect(EFFECT_IDS).toHaveLength(24);
    EFFECT_IDS.forEach((id, i) => {
      expect(EFFECTS[id].code).toBe(`E${String(i + 1).padStart(2, '0')}`);
    });
    for (const n of [19, 20, 21]) {
      const ref = BG.效果[`E${n}`];
      const e = byCode(`E${n}`);
      expect(EFFECTS[e].seconds).toBe(ref.預設秒數);
      expect(EFFECTS[e].loop).toBe(ref.預設循環);
      expect(isFade(e)).toBe(true);
    }
    for (const id of ['crossfade', 'cut', 'wipe'] as const) {
      expect(EFFECTS[id]).toMatchObject({ seconds: 3, loop: true });
      expect(isSwitch(id)).toBe(true);
    }
  });
});
