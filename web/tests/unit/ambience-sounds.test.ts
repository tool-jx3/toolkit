/**
 * core/audio/ambience 的 24 種環境音：目錄、參數的整理、每個聲音的合成結果（首尾相接、同一個種子一樣、音量範圍、
 * 不破音），以及各聲音的頻譜特徵（白／粉紅／棕色的斜率、雨的距離、蟲鳴的頻率、心跳與日光燈的低頻、時鐘與心跳的節拍…）。
 * 合成是純函式：用 16 kHz、20 秒算，速度快。
 */
import { describe, expect, it } from 'vitest';
import { fftInPlace } from '@/core/audio';
import {
  AMBIENCE_CATEGORIES,
  AMBIENCE_SOUNDS,
  ambienceKey,
  ambienceSeconds,
  ambienceSound,
  defaultParams,
  isDefaultParams,
  renderAmbience,
  sanitizeParams,
  soundsInCategory,
} from '@/core/audio/ambience';
import { peak, rms, toDb } from '@/core/audio/ambience/dsp';

const SR = 16000;
const SECS = 20;

const render = (id: string, params: Record<string, number> = {}, seed = 1, seconds = SECS) => {
  const def = ambienceSound(id);
  if (!def) throw new Error(id);
  return renderAmbience(
    id,
    { ...defaultParams(def), ...params },
    { duration: seconds, sampleRate: SR, seed },
  );
};

/** 平均功率頻譜（2048 點、Hann 窗），回傳 [lo, hi) 頻帶占全部的比例 */
function bandShare(x: Float32Array, lo: number, hi: number, sr = SR): number {
  const N = 2048;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const power = new Float64Array(N / 2);
  for (let s = 0; s + N <= x.length; s += N) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 1; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  let total = 0;
  let band = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    total += power[k];
    if (f >= lo && f < hi) band += power[k];
  }
  return total > 0 ? band / total : 0;
}

/** 頻譜的重心（Hz） */
function centroid(x: Float32Array, sr = SR): number {
  const N = 2048;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let num = 0;
  let den = 0;
  for (let s = 0; s + N <= x.length; s += N * 2) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      num += p * ((k * sr) / N);
      den += p;
    }
  }
  return den ? num / den : 0;
}

/** 某個頻率的強度（Goertzel，均方根量級） */
function toneLevel(x: Float32Array, f: number, sr = SR): number {
  const w = (2 * Math.PI * f) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
}

/** 依 10 ms 的音量找「一聲一聲」的起點（超過門檻、之前 minGap 秒內沒有） */
function onsets(x: Float32Array, threshold: number, minGap: number, sr = SR): number[] {
  const hop = Math.round(sr * 0.01);
  const out: number[] = [];
  let last = -Infinity;
  for (let s = 0; s + hop <= x.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + hop; i++) e = Math.max(e, Math.abs(x[i]));
    const t = s / sr;
    if (e > threshold && t - last > minGap) {
      out.push(t);
      last = t;
    }
  }
  return out;
}

/** 接縫：最後一個取樣到第一個的跳動，不超過接縫附近相鄰取樣差的最大值（×1.5） */
function seamOk(ch: Float32Array): boolean {
  const n = ch.length;
  const jump = Math.abs(ch[0] - ch[n - 1]);
  let local = 0;
  for (let i = n - 64; i < n - 1; i++) local = Math.max(local, Math.abs(ch[i + 1] - ch[i]));
  for (let i = 0; i < 63; i++) local = Math.max(local, Math.abs(ch[i + 1] - ch[i]));
  return jump <= local * 1.5 + 1e-4;
}

describe('目錄', () => {
  it('24 種聲音、7 個分類，每個分類都有聲音，id 不重複', () => {
    expect(AMBIENCE_SOUNDS).toHaveLength(24);
    expect(AMBIENCE_CATEGORIES.map((c) => c.id)).toEqual([
      'weather',
      'water',
      'fire',
      'indoor',
      'life',
      'mood',
      'noise',
    ]);
    expect(new Set(AMBIENCE_SOUNDS.map((s) => s.id)).size).toBe(24);
    for (const c of AMBIENCE_CATEGORIES) expect(soundsInCategory(c.id).length).toBeGreaterThan(0);
    for (const s of AMBIENCE_SOUNDS) {
      expect(s.label).toMatch(/\p{sc=Han}/u);
      expect(s.description.length).toBeGreaterThan(8);
      expect(s.params.length).toBeGreaterThan(0);
      expect(s.gain).toBeGreaterThan(0);
      for (const p of s.params) {
        if (p.kind === 'range') {
          expect(p.default).toBeGreaterThanOrEqual(p.min);
          expect(p.default).toBeLessThanOrEqual(p.max);
        } else {
          expect(p.default).toBeLessThan(p.options.length);
        }
      }
      expect(isDefaultParams(s, defaultParams(s))).toBe(true);
    }
  });

  it('參數的整理：夾在範圍、對齊間隔、選項索引夾住、不認識的丟掉、缺的補預設', () => {
    const rain = ambienceSound('rain-light');
    const clock = ambienceSound('clock');
    if (!rain || !clock) throw new Error('missing');
    expect(sanitizeParams(rain, { intensity: 150, distance: '12.4', extra: 3 })).toEqual({
      intensity: 100,
      distance: 12,
    });
    expect(sanitizeParams(rain, null)).toEqual(defaultParams(rain));
    expect(sanitizeParams(clock, { type: 9, room: -3 })).toEqual({ type: 2, room: 0 });
    expect(sanitizeParams(clock, { type: Number.NaN })).toEqual(defaultParams(clock));
    const hb = ambienceSound('heartbeat');
    if (!hb) throw new Error('missing');
    expect(sanitizeParams(hb, { bpm: 20 }).bpm).toBe(40);
  });

  it('長度：整數秒、10～600；快取的鍵依整理過的參數', () => {
    expect(ambienceSeconds(3)).toBe(10);
    expect(ambienceSeconds(60.4)).toBe(60);
    expect(ambienceSeconds(9999)).toBe(600);
    const o = { duration: 60, sampleRate: 32000, seed: 1 };
    expect(ambienceKey('rain-light', { intensity: 45.2 }, o)).toBe(
      ambienceKey('rain-light', { intensity: 45 }, o),
    );
    expect(ambienceKey('rain-light', {}, o)).not.toBe(
      ambienceKey('rain-light', {}, { ...o, seed: 2 }),
    );
  });
});

describe('每個聲音的合成', () => {
  for (const def of AMBIENCE_SOUNDS) {
    it(`${def.id}（${def.label}）：長度、聲道、首尾相接、音量範圍、不破音`, () => {
      const pcm = render(def.id);
      expect(pcm.sampleRate).toBe(SR);
      expect(pcm.channels).toHaveLength(def.stereo ? 2 : 1);
      for (const ch of pcm.channels) {
        expect(ch).toHaveLength(SR * SECS);
        expect(ch.every(Number.isFinite)).toBe(true);
        expect(seamOk(ch)).toBe(true);
        let mean = 0;
        for (let i = 0; i < ch.length; i++) mean += ch[i];
        expect(Math.abs(mean / ch.length)).toBeLessThan(1e-3);
      }
      const db = toDb(rms(pcm.channels));
      expect(db).toBeGreaterThan(-48);
      expect(db).toBeLessThan(-10);
      expect(peak(pcm.channels)).toBeLessThanOrEqual(0.99);
      expect(toDb(peak(pcm.channels))).toBeGreaterThan(-24);
    });
  }

  it('同一個種子結果一樣、不同的種子不一樣（兩次都在 Node 裡算）', () => {
    for (const id of ['rain-light', 'thunder', 'crowd', 'clock']) {
      const a = render(id, {}, 7, 10);
      const b = render(id, {}, 7, 10);
      const c = render(id, {}, 8, 10);
      expect(a.channels[0]).toEqual(b.channels[0]);
      expect(a.channels[0]).not.toEqual(c.channels[0]);
    }
  });

  it('不認識的聲音丟錯', () => {
    expect(() => renderAmbience('nope', {}, { duration: 10, sampleRate: SR, seed: 1 })).toThrow();
  });
});

describe('頻譜特徵', () => {
  it('雜訊：白 > 粉紅 > 棕色（頻譜重心）；音色越亮重心越高、音量不變', () => {
    const w = centroid(render('white-noise').channels[0]);
    const p = centroid(render('pink-noise').channels[0]);
    const b = centroid(render('brown-noise').channels[0]);
    expect(w).toBeGreaterThan(p);
    expect(p).toBeGreaterThan(b * 2);
    const dark = render('white-noise', { tone: 0 });
    const bright = render('white-noise', { tone: 100 });
    expect(centroid(bright.channels[0])).toBeGreaterThan(centroid(dark.channels[0]) * 1.5);
    expect(Math.abs(toDb(rms(dark.channels)) - toDb(rms(bright.channels)))).toBeLessThan(1);
  });

  it('雨：越遠高頻越少；越大雨音量越大；大雨比小雨低頻多', () => {
    const near = render('rain-light', { distance: 0 }).channels[0];
    const far = render('rain-light', { distance: 100 }).channels[0];
    expect(bandShare(far, 4000, 8000)).toBeLessThan(bandShare(near, 4000, 8000) * 0.5);
    const soft = render('rain-light', { intensity: 0 });
    const hard = render('rain-light', { intensity: 100 });
    expect(rms(hard.channels)).toBeGreaterThan(rms(soft.channels) * 1.5);
    const heavy = render('rain-heavy').channels[0];
    expect(bandShare(heavy, 30, 400)).toBeGreaterThan(bandShare(near, 30, 400) * 2);
  });

  it('雷：大部分能量在 500 Hz 以下；頻繁時一段裡的雷比較多', () => {
    const x = render('thunder', {}, 1, 60).channels[0];
    expect(bandShare(x, 20, 500)).toBeGreaterThan(0.85);
    const few = onsets(render('thunder', { frequency: 0, distance: 0 }, 1, 60).channels[0], 0.2, 5);
    const many = onsets(
      render('thunder', { frequency: 100, distance: 0 }, 1, 60).channels[0],
      0.2,
      5,
    );
    expect(few.length).toBeGreaterThanOrEqual(1);
    expect(many.length).toBeGreaterThan(few.length + 1);
  });

  it('蟲鳴：能量集中在 3.5～5.5 kHz', () => {
    const x = render('crickets', { far: 0 }).channels[0];
    expect(bandShare(x, 3500, 5600)).toBeGreaterThan(0.7);
  });

  it('心跳：能量在 300 Hz 以下，次數照心跳數', () => {
    const slow = render('heartbeat', { bpm: 60 }).channels[0];
    expect(bandShare(slow, 20, 300)).toBeGreaterThan(0.85);
    /* 每一下是「撲通」兩聲：找主要那一聲（門檻高、間隔 0.5 秒以上） */
    const pk = peak([slow]);
    const beats = onsets(slow, pk * 0.6, 0.5);
    expect(beats.length).toBeGreaterThanOrEqual(19);
    expect(beats.length).toBeLessThanOrEqual(21);
    const fast = render('heartbeat', { bpm: 120 }).channels[0];
    const pkf = peak([fast]);
    expect(onsets(fast, pkf * 0.6, 0.3).length).toBeGreaterThanOrEqual(38);
  });

  it('時鐘：掛鐘每秒一聲、懷錶每秒五聲', () => {
    const wall = render('clock', { type: 0, room: 0 }).channels[0];
    const pw = peak([wall]);
    expect(onsets(wall, pw * 0.3, 0.5)).toHaveLength(20);
    const pocket = render('clock', { type: 2, room: 0 }).channels[0];
    const pp = peak([pocket]);
    const n = onsets(pocket, pp * 0.3, 0.1).length;
    expect(n).toBeGreaterThanOrEqual(95);
    expect(n).toBeLessThanOrEqual(100);
  });

  it('日光燈：120 Hz（臺灣 60 Hz 的倍頻）比旁邊的頻率強很多', () => {
    const x = render('office-hum', { hum: 100, fan: 0 }).channels[0];
    expect(toneLevel(x, 120)).toBeGreaterThan(toneLevel(x, 90) * 20);
    expect(toneLevel(x, 60)).toBeGreaterThan(toneLevel(x, 75) * 10);
  });

  it('低鳴：音高越高，主要的低頻往上；不安越多，1～2 kHz 以下的不和諧音越多', () => {
    const lo = render('drone', { pitch: 0 }).channels[0];
    const hi = render('drone', { pitch: 100 }).channels[0];
    expect(centroid(hi)).toBeGreaterThan(centroid(lo));
    expect(bandShare(lo, 20, 200)).toBeGreaterThan(0.6);
  });

  it('海浪：一道一道（1 秒的音量起伏大）', () => {
    const x = render('waves', {}, 1, 30).channels[0];
    const win = SR;
    const levels: number[] = [];
    for (let s = 0; s + win <= x.length; s += win) levels.push(rms([x.subarray(s, s + win)]));
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(2);
  });

  it('洞窟的水滴：回聲越大，水滴之間越不安靜', () => {
    const dry = render('cave-drips', { echo: 0 }).channels[0];
    const wet = render('cave-drips', { echo: 100 }).channels[0];
    const quiet = (x: Float32Array) => {
      const levels: number[] = [];
      for (let s = 0; s + 160 <= x.length; s += 160) levels.push(rms([x.subarray(s, s + 160)]));
      levels.sort((a, b) => a - b);
      return levels[Math.floor(levels.length * 0.2)] / rms([x]);
    };
    expect(quiet(wet)).toBeGreaterThan(quiet(dry) * 1.5);
  });

  it('人聲：能量集中在說話的頻率（200～3000 Hz）；越遠高頻越少', () => {
    const near = render('crowd', { distance: 0, clink: 0 }).channels[0];
    const far = render('crowd', { distance: 100, clink: 0 }).channels[0];
    expect(bandShare(near, 150, 3000)).toBeGreaterThan(0.7);
    expect(bandShare(far, 1500, 8000)).toBeLessThan(bandShare(near, 1500, 8000) * 0.5);
  });

  it('營火：劈啪聲越多，短促的高頻爆裂越多', () => {
    const few = render('campfire', { crackle: 0 }).channels[0];
    const many = render('campfire', { crackle: 100 }).channels[0];
    expect(bandShare(many, 1500, 8000)).toBeGreaterThan(bandShare(few, 1500, 8000));
  });
});
