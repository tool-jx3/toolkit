/**
 * core/audio：PCM 16-bit WAV 編碼、靜音、依時間點混音（疊加／不疊音）、淡出。
 */
import { describe, expect, it } from 'vitest';
import {
  applyFadeOut,
  createSilence,
  encodeWav,
  mixAtTimes,
  type PcmAudio,
  parseWav,
  pcmDuration,
  pcmLength,
  resample,
  skipOverlapping,
} from '@/core/audio';

/** 0.25 秒的方波嗶聲（值 0.5） */
const beep = (rate = 1000, seconds = 0.25, channels = 1): PcmAudio => ({
  sampleRate: rate,
  channels: Array.from({ length: channels }, () => new Float32Array(rate * seconds).fill(0.5)),
});

describe('WAV', () => {
  it('RIFF 標頭、PCM 16-bit、取樣率、聲道數、資料長度', () => {
    const a = createSilence(0.5, { sampleRate: 44100, channels: 2 });
    a.channels[0][0] = 1;
    a.channels[1][0] = -1;
    const bytes = encodeWav(a);
    const v = new DataView(bytes.buffer);
    const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(22050 * 2 * 2);
    expect(bytes.length).toBe(44 + 22050 * 4);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
    const back = parseWav(bytes);
    expect(back.sampleRate).toBe(44100);
    expect(back.channels).toHaveLength(2);
    expect(pcmLength(back)).toBe(22050);
  });

  it('靜音：預設 44,100 Hz 單聲道，全部是 0', () => {
    const s = createSilence(1.5);
    expect(s.sampleRate).toBe(44100);
    expect(s.channels).toHaveLength(1);
    expect(pcmDuration(s)).toBeCloseTo(1.5, 9);
    expect(parseWav(encodeWav(s)).channels[0].every((x) => x === 0)).toBe(true);
  });
});

describe('混音', () => {
  /* 打字機 3.10 的量測：「AB 한」6 單位、10 FPS、停留 1 秒、0.25 秒的嗶聲 */
  const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

  it('每格都播：時間點都放、可疊加（最多 3 聲）', () => {
    const out = mixAtTimes(beep(), times, { duration: 1.6 });
    expect(pcmDuration(out)).toBeCloseTo(1.6, 9);
    const at = (t: number) => out.channels[0][Math.round(t * 1000)];
    expect(at(0.05)).toBeCloseTo(0.5, 6);
    expect(at(0.15)).toBeCloseTo(1, 6);
    /* 0.2～0.25 秒有三聲疊加，夾在 1 */
    expect(at(0.22)).toBe(1);
    expect(at(0.8)).toBe(0);
  });

  it('不疊音：上一聲沒放完的時間點跳過 → 只剩 0 與 0.3 秒', () => {
    expect(skipOverlapping(times, 0.25)).toEqual([0, 0.3]);
    const out = mixAtTimes(beep(), skipOverlapping(times, 0.25), {
      duration: 1.6,
      fade: { start: 0.6, end: 0.8 },
    });
    const at = (t: number) => out.channels[0][Math.round(t * 1000)];
    expect(at(0.1)).toBeCloseTo(0.5, 6);
    expect(at(0.27)).toBe(0);
    expect(at(0.4)).toBeCloseTo(0.5, 6);
  });

  it('淡出：start 以前不變、end 降到 0', () => {
    const a = applyFadeOut(beep(1000, 1), 0.5, 0.7);
    expect(a.channels[0][400]).toBeCloseTo(0.5, 6);
    expect(a.channels[0][600]).toBeCloseTo(0.25, 2);
    expect(a.channels[0][750]).toBe(0);
  });

  it('輸出聲道數與取樣率可以和音效不同', () => {
    const out = mixAtTimes(beep(1000, 0.25, 1), [0], {
      duration: 0.5,
      sampleRate: 2000,
      channels: 2,
    });
    expect(out.sampleRate).toBe(2000);
    expect(out.channels).toHaveLength(2);
    expect(out.channels[1][100]).toBeCloseTo(0.5, 6);
    expect(pcmLength(resample(beep(1000, 0.25), 500))).toBe(125);
  });
});
