/**
 * core/audio/mp3：影格的檔頭、CRC-16、Info 標頭（LAME 的編碼器延遲與填充）、循環的編法，以及在 Node 裡用 lamejs 實際編碼，
 * 檢查檔案的結構（Info 標頭＋留下的影格、每個影格都能單獨解碼、標頭裡的長度剛好是一整段循環）。
 * 解碼與接縫的量測在瀏覽器裡做（e2e：ambience-mixer 的「匯出 MP3」，Chromium 的 decodeAudioData）。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PcmAudio } from '@/core/audio';
import {
  crc16,
  encodeMp3,
  LAME_ENCODER_DELAY,
  listMp3Frames,
  MP3_DECODER_DELAY,
  MP3_TOTAL_DELAY,
  Mp3EncodeError,
  mp3Bitrates,
  mp3FrameSamples,
  mp3InfoFrame,
  mp3LoopBytes,
  mp3LoopPlan,
  readMp3Header,
  readMp3InfoTag,
} from '@/core/audio/mp3';
import { encodeMp3Loop } from '@/core/audio/mp3/encode';
import { createRandom } from '@/core/timeline';

const bytes = (...b: number[]) => Uint8Array.from(b);

/** 一段首尾相接的測試聲音：440 Hz（整段剛好整數個週期）＋一點雜訊 */
function loopPcm(seconds: number, rate: number, channels: 1 | 2): PcmAudio {
  const n = Math.round(seconds * rate);
  const rng = createRandom(3);
  const make = (phase: number) => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++)
      c[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate + phase) + (rng.next() - 0.5) * 0.1;
    return c;
  };
  return { sampleRate: rate, channels: channels === 2 ? [make(0), make(1)] : [make(0)] };
}

/** 影格的 main_data_begin（side information 的開頭：MPEG-1 9 位元、MPEG-2 8 位元） */
function mainDataBegin(file: Uint8Array, offset: number, version: number): number {
  const p = offset + 4;
  return version === 1 ? (file[p] << 1) | (file[p + 1] >> 7) : file[p];
}

describe('影格的檔頭', () => {
  it('MPEG-1 Layer III：位元率、取樣率、填充、聲道、長度', () => {
    expect(readMp3Header(bytes(0xff, 0xfb, 0x90, 0x00))).toEqual({
      version: 1,
      bitrate: 128,
      sampleRate: 44100,
      padding: false,
      crc: false,
      channelMode: 0,
      length: 417,
      samples: 1152,
      sideInfo: 32,
    });
    expect(readMp3Header(bytes(0xff, 0xfb, 0x92, 0xc0))).toMatchObject({
      padding: true,
      length: 418,
      channelMode: 3,
      sideInfo: 17,
    });
    expect(readMp3Header(bytes(0xff, 0xfa, 0x98, 0x00))).toMatchObject({
      sampleRate: 32000,
      bitrate: 128,
      crc: true,
      length: 576,
    });
  });

  it('MPEG-2（22.05 kHz）：每格 576 個取樣、位元率表不同', () => {
    expect(readMp3Header(bytes(0xff, 0xf3, 0x90, 0xc0))).toMatchObject({
      version: 2,
      bitrate: 80,
      sampleRate: 22050,
      length: 261,
      samples: 576,
      sideInfo: 9,
    });
    expect(mp3FrameSamples(22050)).toBe(576);
    expect(mp3FrameSamples(32000)).toBe(1152);
    expect(mp3Bitrates(22050)).toContain(160);
    expect(mp3Bitrates(22050)).not.toContain(192);
    expect(mp3Bitrates(44100)).toContain(320);
  });

  it('不是 Layer III 的影格、保留值：null', () => {
    expect(readMp3Header(bytes(0x00, 0xfb, 0x90, 0x00))).toBeNull();
    /* Layer II */
    expect(readMp3Header(bytes(0xff, 0xfd, 0x90, 0x00))).toBeNull();
    /* 保留的版本 */
    expect(readMp3Header(bytes(0xff, 0xeb, 0x90, 0x00))).toBeNull();
    /* 位元率 15、取樣率 3 */
    expect(readMp3Header(bytes(0xff, 0xfb, 0xf0, 0x00))).toBeNull();
    expect(readMp3Header(bytes(0xff, 0xfb, 0x9c, 0x00))).toBeNull();
    expect(readMp3Header(bytes(0xff, 0xfb, 0x90))).toBeNull();
  });

  it('影格清單：跳過 ID3v2 標籤，遇到不是影格的位元組就停', () => {
    const frame = new Uint8Array(417);
    frame.set([0xff, 0xfb, 0x90, 0x00]);
    const id3 = bytes(0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5);
    const file = new Uint8Array(id3.length + 417 * 3 + 10);
    file.set(id3);
    for (let k = 0; k < 3; k++) file.set(frame, id3.length + 417 * k);
    const list = listMp3Frames(file);
    expect(list.map((f) => f.offset)).toEqual([15, 15 + 417, 15 + 834]);
  });
});

describe('CRC-16 與 Info 標頭', () => {
  it('CRC-16/ARC 的檢查值（"123456789" → 0xBB3D），可以分段接著算', () => {
    const s = new TextEncoder().encode('123456789');
    expect(crc16(s)).toBe(0xbb3d);
    expect(crc16(s, crc16(s, 0, 0, 4), 4)).toBe(0xbb3d);
  });

  it('寫進去的影格數、位元組數、編碼器延遲與填充讀得回來；標頭的 CRC 對', () => {
    for (const head of [bytes(0xff, 0xfb, 0x90, 0x00), bytes(0xff, 0xf3, 0x90, 0xc0)]) {
      const info = mp3InfoFrame({
        firstHeader: head,
        frames: 280,
        audioBytes: 161280,
        delay: 576,
        padding: 1984,
        bitrate: 128,
        musicCrc: 0x1234,
      });
      const h = readMp3Header(info);
      const ref = readMp3Header(head);
      expect(h?.sampleRate).toBe(ref?.sampleRate);
      expect(h?.channelMode).toBe(ref?.channelMode);
      expect(h?.padding).toBe(false);
      expect(info.length).toBe(h?.length);
      expect(readMp3InfoTag(info)).toEqual({
        kind: 'Info',
        frames: 280,
        bytes: info.length + 161280,
        encoder: 'LAME3.98r',
        delay: 576,
        padding: 1984,
        tagCrcOk: true,
        musicCrc: 0x1234,
        frameLength: info.length,
      });
    }
    /* 22.05 kHz 單聲道 80 kbps 的影格（261 位元組）放得下標頭；8 kbps 的放不下時改用比較大的位元率 */
    const tiny = mp3InfoFrame({
      firstHeader: bytes(0xff, 0xf3, 0x10, 0xc0),
      frames: 1,
      audioBytes: 0,
      delay: 0,
      padding: 0,
      bitrate: 8,
      musicCrc: 0,
    });
    expect(tiny.length).toBeGreaterThanOrEqual(4 + 9 + 156);
    expect(() =>
      mp3InfoFrame({
        firstHeader: bytes(0xff, 0xfb, 0x90, 0x00),
        frames: 1,
        audioBytes: 0,
        delay: 4096,
        padding: 0,
        bitrate: 128,
        musicCrc: 0,
      }),
    ).toThrow();
  });
});

describe('循環的編法', () => {
  it('影格數 × 每格取樣數＝延遲＋循環＋填充；延遲與填充在 0～4095；看不懂標頭時的起步落在裁掉的範圍', () => {
    for (const rate of [44100, 32000, 22050]) {
      for (const seconds of [1, 10, 60, 180, 600]) {
        const n = seconds * rate;
        for (const drop of [0, 1, 2, 3]) {
          const p = mp3LoopPlan(n, rate, { drop });
          expect(p.frames * p.spf).toBe(p.delay + n + p.padding);
          expect(p.delay).toBeGreaterThanOrEqual(0);
          expect(p.delay).toBeLessThanOrEqual(4095);
          expect(p.padding).toBeLessThanOrEqual(4095);
          /* 結尾：循環之後至少 529（解碼器的延遲）＋淡出＋距離 */
          expect(p.padding).toBeGreaterThanOrEqual(MP3_DECODER_DELAY + p.fadeOut + 576);
          expect(p.padding).toBeLessThan(MP3_DECODER_DELAY + p.fadeOut + 576 + p.spf);
          /* 裁掉的開頭（延遲＋529）蓋住解碼器起步的約 1100 個取樣（丟影格時）、或淡入＋距離（不丟時） */
          expect(p.delay + MP3_DECODER_DELAY).toBeGreaterThanOrEqual(
            drop ? MP3_TOTAL_DELAY : MP3_TOTAL_DELAY + p.fadeIn + 576,
          );
          expect(p.fed).toBe((p.drop + p.frames) * p.spf - MP3_TOTAL_DELAY);
        }
      }
    }
    expect(LAME_ENCODER_DELAY + MP3_DECODER_DELAY).toBe(1105);
    /* 預設丟兩個影格（預捲兩個影格長；Info 的延遲仍是 576） */
    expect(mp3LoopPlan(32000, 32000)).toMatchObject({ drop: 2, delay: 576, preroll: 2304 });
    expect(mp3LoopPlan(22050, 22050)).toMatchObject({ drop: 2, delay: 576, preroll: 1152 });
  });
});

describe('用 lamejs 實際編碼（Node）', () => {
  for (const rate of [44100, 32000, 22050]) {
    for (const ch of [1, 2] as const) {
      it(`${rate} Hz、${ch === 1 ? '單聲道' : '立體聲'}：Info 標頭＋留下的影格；每格都能單獨解碼；標頭裡的長度＝一整段循環`, async () => {
        const pcm = loopPcm(2, rate, ch);
        const n = 2 * rate;
        const progress: number[] = [];
        const file = await encodeMp3Loop(
          pcm,
          { kbps: 128 },
          { onProgress: (f) => progress.push(f) },
        );
        const plan = mp3LoopPlan(n, rate);
        const frames = listMp3Frames(file);
        expect(frames).toHaveLength(1 + plan.frames);
        /* 檔案剛好是這些影格（後面沒有別的東西） */
        const last = frames[frames.length - 1];
        expect(last.offset + last.header.length).toBe(file.length);
        for (const f of frames.slice(1)) {
          expect(f.header.sampleRate).toBe(rate);
          expect(f.header.bitrate).toBe(128);
          expect(f.header.channelMode).toBe(ch === 1 ? 3 : 0);
          /* 位元儲備關掉了：每個影格的資料都在自己裡面（所以可以丟掉開頭的影格） */
          expect(mainDataBegin(file, f.offset, f.header.version)).toBe(0);
        }
        const tag = readMp3InfoTag(file);
        expect(tag).toMatchObject({
          kind: 'Info',
          frames: plan.frames,
          bytes: file.length,
          delay: plan.delay,
          padding: plan.padding,
          tagCrcOk: true,
        });
        expect(tag?.musicCrc).toBe(crc16(file, 0, frames[1].offset));
        expect(
          (tag?.frames ?? 0) * mp3FrameSamples(rate) - (tag?.delay ?? 0) - (tag?.padding ?? 0),
        ).toBe(n);
        /* 大小的估計差不到幾個位元組 */
        expect(Math.abs(mp3LoopBytes(2, rate, 128) - file.length)).toBeLessThanOrEqual(2);
        /* 進度一路往上到 1 */
        expect(progress.at(-1)).toBe(1);
        for (let i = 1; i < progress.length; i++)
          expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
      });
    }
  }

  it('同樣的輸入每次編出來一樣', async () => {
    const pcm = loopPcm(1, 32000, 2);
    const a = await encodeMp3Loop(pcm, { kbps: 128 });
    const b = await encodeMp3Loop(pcm, { kbps: 128 });
    expect(a).toEqual(b);
  });

  it('不能用的位元率、LAME 會改取樣率的組合：Mp3EncodeError；取消（pause 回傳 false）：AbortError', async () => {
    await expect(encodeMp3Loop(loopPcm(1, 22050, 2), { kbps: 192 })).rejects.toBeInstanceOf(
      Mp3EncodeError,
    );
    /* 44.1 kHz 立體聲 96 kbps：LAME 自己降成 32 kHz */
    await expect(encodeMp3Loop(loopPcm(1, 44100, 2), { kbps: 96 })).rejects.toThrow(
      '編碼器把取樣率換成了 32000 Hz、96 kbps',
    );
    await expect(
      encodeMp3Loop({ sampleRate: 32000, channels: [new Float32Array(0)] }, { kbps: 128 }),
    ).rejects.toBeInstanceOf(Mp3EncodeError);
    await expect(
      encodeMp3Loop(loopPcm(4, 32000, 2), { kbps: 128 }, { pause: () => false }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('encodeMp3：Worker 開不起來時在主執行緒編（驗證後修正）', () => {
  const g = globalThis as Record<string, unknown>;
  let saved: { window: PropertyDescriptor | undefined; Worker: PropertyDescriptor | undefined };
  beforeEach(() => {
    saved = {
      window: Object.getOwnPropertyDescriptor(g, 'window'),
      Worker: Object.getOwnPropertyDescriptor(g, 'Worker'),
    };
    g.window = globalThis;
  });
  afterEach(() => {
    for (const k of ['window', 'Worker'] as const) {
      const d = saved[k];
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
  });

  it('new Worker 同步丟例外（SecurityError：file://、CSP）：主執行緒編，結果和直接編一樣、有進度', async () => {
    let tried = 0;
    g.Worker = class {
      constructor() {
        tried++;
        throw new DOMException('blocked', 'SecurityError');
      }
    };
    const pcm = loopPcm(1, 32000, 2);
    const progress: number[] = [];
    const bytes = await encodeMp3(pcm, { kbps: 128 }, { onProgress: (f) => progress.push(f) });
    expect(tried).toBe(1);
    expect(bytes).toEqual(await encodeMp3Loop(pcm, { kbps: 128 }));
    expect(progress.at(-1)).toBe(1);
  });

  it('Worker 載不到（error 事件 → WorkerFailedError）：主執行緒編', async () => {
    g.Worker = class extends EventTarget {
      postMessage() {
        queueMicrotask(() => this.dispatchEvent(new Event('error')));
      }
      terminate() {}
    };
    const pcm = loopPcm(1, 22050, 1);
    expect(await encodeMp3(pcm, { kbps: 128 })).toEqual(await encodeMp3Loop(pcm, { kbps: 128 }));
  });

  it('取消：丟 AbortError（主執行緒編的時候也停下來）', async () => {
    g.Worker = class {
      constructor() {
        throw new DOMException('blocked', 'SecurityError');
      }
    };
    const ctrl = new AbortController();
    await expect(
      encodeMp3(
        loopPcm(4, 32000, 2),
        { kbps: 128 },
        { signal: ctrl.signal, onProgress: () => ctrl.abort() },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    ctrl.abort();
    await expect(
      encodeMp3(loopPcm(1, 32000, 2), { kbps: 128 }, { signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
