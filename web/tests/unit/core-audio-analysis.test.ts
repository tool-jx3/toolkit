/**
 * core/audio 的聲音分析：FFT、Blackman 窗、離線頻譜（AnalyserNode 的格式）、整首波形峰值、對數頻帶、低頻能量、檔頭判斷。
 */
import { describe, expect, it } from 'vitest';
import { assetFileInfo } from '@/core/assets';
import {
  bandAverage,
  blackmanWindow,
  createOfflineAnalyser,
  detectAudioType,
  encodeWav,
  fftInPlace,
  logFrequencyBands,
  type PcmAudio,
  waveformPeaks,
} from '@/core/audio';

const sine = (freq: number, seconds: number, sr = 48000, amp = 1, stereo = false): PcmAudio => {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return { sampleRate: sr, channels: stereo ? [a, a.slice()] : [a] };
};

describe('fftInPlace', () => {
  it('第 k 個桶的正弦波：能量集中在 k 與 N−k', () => {
    const N = 64;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / N);
    fftInPlace(re, im);
    const mag = Array.from(re, (r, k) => Math.hypot(r, im[k]));
    expect(mag[5]).toBeCloseTo(N / 2, 6);
    expect(mag[N - 5]).toBeCloseTo(N / 2, 6);
    expect(Math.max(...mag.filter((_, k) => k !== 5 && k !== N - 5))).toBeLessThan(1e-9);
  });
  it('直流：全部集中在第 0 個桶', () => {
    const re = new Float64Array(8).fill(1);
    const im = new Float64Array(8);
    fftInPlace(re, im);
    expect(re[0]).toBeCloseTo(8);
    expect(Math.max(...Array.from(re.slice(1), Math.abs))).toBeLessThan(1e-12);
  });
});

describe('blackmanWindow', () => {
  it('兩端 0、中央 1（分母是 N）', () => {
    const w = blackmanWindow(2048);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[1024]).toBeCloseTo(1, 6);
    expect(w[512]).toBeCloseTo(0.42 + 0.08 * Math.cos(Math.PI), 6);
  });
});

describe('createOfflineAnalyser', () => {
  it('靜音：頻譜全 0、波形全 128；開頭之前也是靜音', () => {
    const a = createOfflineAnalyser({ sampleRate: 48000, channels: [new Float32Array(48000)] });
    a.at(0.5);
    expect(Math.max(...a.frequency)).toBe(0);
    expect(new Set(a.timeDomain)).toEqual(new Set([128]));
    expect(a.frequencyBinCount).toBe(1024);
  });
  it('1 kHz 正弦：最高的桶在 1000 ÷ (48000 ÷ 2048) 附近；波形在 0～255 之間來回', () => {
    const a = createOfflineAnalyser(sine(1000, 2, 48000, 0.5), { fps: 60 });
    for (let f = 1; f <= 60; f++) a.at(f / 60);
    let best = 0;
    for (let k = 1; k < a.frequency.length; k++) if (a.frequency[k] > a.frequency[best]) best = k;
    expect(Math.abs(best - 1000 / (48000 / 2048))).toBeLessThan(1);
    expect(a.frequency[best]).toBe(255);
    expect(a.frequency[400]).toBeLessThan(40);
    expect(Math.min(...a.timeDomain)).toBeLessThanOrEqual(65);
    expect(Math.max(...a.timeDomain)).toBeGreaterThanOrEqual(191);
  });
  it('平滑：時間常數以每秒 60 次換算（30 FPS 時一格就接近穩定值的更多）', () => {
    const song = sine(3000, 1, 48000, 0.01);
    const at60 = createOfflineAnalyser(song, { fps: 60 });
    const at30 = createOfflineAnalyser(song, { fps: 30 });
    at60.at(0.5);
    at30.at(0.5);
    const k = Math.round(3000 / (48000 / 2048));
    expect(at30.frequency[k]).toBeGreaterThan(at60.frequency[k]);
    at60.reset();
    at60.at(0.5);
    const first = at60.frequency[k];
    at60.at(0.5);
    expect(at60.frequency[k]).toBeGreaterThan(first);
  });
  it('立體聲平均成單聲道（左右相反時抵消成靜音）', () => {
    const l = sine(500, 1).channels[0];
    const r = l.map((v) => -v);
    const a = createOfflineAnalyser({ sampleRate: 48000, channels: [l, r] });
    a.at(0.5);
    expect(Math.max(...a.frequency)).toBe(0);
  });
});

describe('waveformPeaks', () => {
  it('每段的均方根 ÷ 最大值，^0.85、夾在 0.06～1', () => {
    const sr = 1000;
    const a = new Float32Array(4000);
    a.fill(0.5, 0, 1000);
    a.fill(0.25, 1000, 2000);
    /* 2000～3000 靜音，3000～4000 是 0.5 */
    a.fill(0.5, 3000, 4000);
    const p = waveformPeaks({ sampleRate: sr, channels: [a] }, 4);
    expect(Array.from(p)).toEqual([1, Math.fround(0.5 ** 0.85), Math.fround(0.06), 1]);
  });
  it('左右聲道的絕對值相加', () => {
    const l = new Float32Array(1600).fill(0.2);
    const r = new Float32Array(1600).fill(-0.2);
    r.fill(0, 800);
    const p = waveformPeaks({ sampleRate: 1000, channels: [l, r] }, 2);
    expect(p[0]).toBe(1);
    expect(p[1]).toBeCloseTo(0.5 ** 0.85, 5);
  });
});

describe('logFrequencyBands', () => {
  it('35 Hz～16 kHz 依對數分段；每段至少一個桶、不超過桶數、由低到高', () => {
    const bands = logFrequencyBands(48, { sampleRate: 48000, fftSize: 2048 });
    expect(bands).toHaveLength(48);
    expect(bands[0]).toEqual([1, 2]);
    expect(bands[47][1]).toBe(Math.ceil(16000 / (48000 / 2048)));
    for (const [lo, hi] of bands) {
      expect(hi).toBeGreaterThan(lo);
      expect(hi).toBeLessThanOrEqual(1024);
    }
    for (let i = 1; i < bands.length; i++)
      expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][0]);
  });
});

describe('bandAverage', () => {
  it('[lo, hi) 的平均 ÷ 255', () => {
    expect(bandAverage([0, 255, 255, 0, 51, 51, 51, 51], 1, 8)).toBeCloseTo(
      (255 * 2 + 51 * 4) / 7 / 255,
    );
    expect(bandAverage([1, 2, 3], 2, 2)).toBe(0);
  });
});

describe('detectAudioType', () => {
  const bytes = (...v: (number | string)[]) =>
    new Uint8Array(
      v.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])),
    );
  it('WAV、OGG、FLAC、MP3（ID3／影格）、M4A、WebM、ADTS AAC', () => {
    expect(detectAudioType(encodeWav({ sampleRate: 8000, channels: [new Float32Array(4)] }))).toBe(
      'wav',
    );
    expect(detectAudioType(bytes('OggS', 0, 2))).toBe('ogg');
    expect(detectAudioType(bytes('fLaC', 0))).toBe('flac');
    expect(detectAudioType(bytes('ID3', 4, 0))).toBe('mp3');
    expect(detectAudioType(bytes(0xff, 0xfb, 0x90))).toBe('mp3');
    expect(detectAudioType(bytes(0, 0, 0, 0x20, 'ftypM4A '))).toBe('m4a');
    expect(detectAudioType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f))).toBe('webm');
    expect(detectAudioType(bytes(0xff, 0xf1, 0x50))).toBe('aac');
    expect(detectAudioType(bytes(0x89, 'PNG'))).toBeNull();
  });
});

describe('assetFileInfo：音訊檔', () => {
  it('資產庫的檔名與 MIME 認得音訊（圖片照舊、認不得時 png）', () => {
    expect(assetFileInfo(encodeWav({ sampleRate: 8000, channels: [new Float32Array(2)] }))).toEqual(
      {
        ext: 'wav',
        mime: 'audio/wav',
      },
    );
    expect(assetFileInfo(new Uint8Array([0x49, 0x44, 0x33, 4]))).toEqual({
      ext: 'mp3',
      mime: 'audio/mpeg',
    });
    expect(assetFileInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toEqual({
      ext: 'png',
      mime: 'image/png',
    });
    expect(assetFileInfo(new Uint8Array([1, 2, 3]))).toEqual({ ext: 'png', mime: 'image/png' });
  });
});
