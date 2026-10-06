/**
 * core/video 的有聲影片：MP4／MOV 的封裝（AAC、Opus、PCM 聲音軌，H.264／VP9，非關鍵影格、顯示順序），
 * 以及 findMoviePlan／encodeMovie 的流程（用模擬的 WebCodecs 編碼器產生合成的編碼資料）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aacAudioSpecificConfig,
  encodeMovie,
  findMoviePlan,
  type MoviePlan,
  movieLayout,
  parseOpusHead,
  pickRecordingType,
  vp9Level,
  vpcCFor,
} from '@/core/video';

/* ---------- MP4 的 box 樹 ---------- */

interface Box {
  type: string;
  start: number;
  size: number;
  children: Box[];
}
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint16(o);
const ascii = (b: Uint8Array, o: number, n = 4) => String.fromCharCode(...b.subarray(o, o + n));

function parse(b: Uint8Array, start = 0, end = b.length): Box[] {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    const size = u32(b, o);
    const type = ascii(b, o + 4);
    out.push({
      type,
      start: o,
      size,
      children: CONTAINERS.has(type) ? parse(b, o + 8, Math.min(end, o + size)) : [],
    });
    if (type === 'mdat' || size < 8) break;
    o += size;
  }
  return out;
}
const find = (boxes: Box[], path: string[]): Box => {
  let list = boxes;
  let cur: Box | undefined;
  for (const t of path) {
    cur = list.find((x) => x.type === t);
    if (!cur) throw new Error(`沒有 ${path.join('/')}`);
    list = cur.children;
  }
  return cur!;
};
const traks = (boxes: Box[]) => find(boxes, ['moov']).children.filter((x) => x.type === 'trak');
const table = (b: Uint8Array, box: Box, headerWords: number, perEntry: number) => {
  const n = u32(b, box.start + 12 + (headerWords - 1) * 4);
  const base = box.start + 12 + headerWords * 4;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: perEntry }, (_, k) => u32(b, base + (i * perEntry + k) * 4)),
  );
};
const STBL = ['mdia', 'minf', 'stbl'];
const stblOf = (trak: Box) => {
  let list = trak.children;
  let cur: Box | undefined;
  for (const t of STBL) {
    cur = list.find((x) => x.type === t)!;
    list = cur.children;
  }
  return cur!;
};
const child = (box: Box, type: string) => box.children.find((x) => x.type === type);

/** 依 layout 組出整個檔案：每個樣本的內容是「軌代號＋序號」的重複位元組 */
function assemble(
  layout: ReturnType<typeof movieLayout>,
  vSizes: number[],
  aSizes: number[],
): Uint8Array {
  const out = new Uint8Array(layout.size);
  out.set(layout.head, 0);
  let o = layout.head.length;
  for (const c of layout.chunks) {
    for (let j = 0; j < c.count; j++) {
      const i = c.first + j;
      const n = c.track === 'video' ? vSizes[i] : aSizes[i];
      out.fill(c.track === 'video' ? i % 100 : 100 + (i % 100), o, o + n);
      o += n;
    }
  }
  expect(o).toBe(layout.size);
  return out;
}

describe('movieLayout：H.264＋AAC 的 MP4', () => {
  const fps = 10;
  const vSizes = Array.from({ length: 25 }, (_, i) => 40 + i);
  const keyFrames = vSizes.map((_, i) => i % 20 === 0);
  const sr = 48000;
  /* 2.5 秒＝117.2 個 AAC 影格 → 118 個 */
  const aSizes = Array.from({ length: 118 }, (_, i) => 7 + (i % 5));
  const durations = aSizes.map(() => 1024);
  const avcC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0]);
  const layout = movieLayout(
    { codec: 'avc1', config: avcC, width: 1920, height: 1080, fps, sizes: vSizes, keyFrames },
    { codec: 'aac', sampleRate: sr, channels: 2, sizes: aSizes, durations, bitrate: 192000 },
  );
  const file = assemble(layout, vSizes, aSizes);
  const boxes = parse(file);

  it('ftyp、moov、mdat；mvhd 的時間單位＝FPS、長度取兩軌較長的、下一個軌道 3', () => {
    expect(boxes.map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat']);
    const mvhd = find(boxes, ['moov', 'mvhd']);
    expect(u32(file, mvhd.start + 20)).toBe(fps);
    expect(u32(file, mvhd.start + 24)).toBe(Math.round(((118 * 1024) / sr) * fps));
    expect(u32(file, mvhd.start + mvhd.size - 4)).toBe(3);
    expect(traks(boxes)).toHaveLength(2);
  });

  it('區塊交錯：影像每秒（FPS 格）一個區塊、聲音湊滿 1 秒一個區塊', () => {
    expect(layout.chunks.map((c) => `${c.track[0]}${c.first}+${c.count}`)).toEqual([
      'v0+10',
      'a0+47',
      'v10+10',
      'a47+47',
      'v20+5',
      'a94+24',
    ]);
  });

  it('影像軌：stss 只列關鍵影格；stsc、stco 指到每個區塊的第一個樣本', () => {
    const [video] = traks(boxes);
    const stbl = stblOf(video);
    expect(table(file, child(stbl, 'stss')!, 1, 1).flat()).toEqual([1, 21]);
    expect(table(file, child(stbl, 'stsc')!, 1, 3)).toEqual([
      [1, 10, 1],
      [3, 5, 1],
    ]);
    const offsets = table(file, child(stbl, 'stco')!, 1, 1).flat();
    expect(offsets.map((o) => file[o])).toEqual([0, 10, 20]);
    expect(child(stbl, 'ctts')).toBeUndefined();
    const stsz = child(stbl, 'stsz')!;
    expect(u32(file, stsz.start + 16)).toBe(25);
  });

  it('聲音軌：mp4a（雙聲道、16 位元、取樣率）＋esds（AAC-LC 的 AudioSpecificConfig、位元率）', () => {
    const audio = traks(boxes)[1];
    const tkhd = child(audio, 'tkhd')!;
    expect(u32(file, tkhd.start + 20)).toBe(2);
    const mdhd = find(audio.children, ['mdia', 'mdhd']);
    expect(u32(file, mdhd.start + 20)).toBe(sr);
    expect(u32(file, mdhd.start + 24)).toBe(118 * 1024);
    const hdlr = find(audio.children, ['mdia', 'hdlr']);
    expect(ascii(file, hdlr.start + 16)).toBe('soun');
    const stbl = stblOf(audio);
    const stsd = child(stbl, 'stsd')!;
    const entry = stsd.start + 16;
    expect(ascii(file, entry + 4)).toBe('mp4a');
    expect(u16(file, entry + 24)).toBe(2);
    expect(u16(file, entry + 26)).toBe(16);
    expect(u32(file, entry + 32)).toBe(sr * 65536);
    const esds = file.subarray(entry + 36, stsd.start + stsd.size);
    expect(ascii(esds, 4)).toBe('esds');
    const asc = [...aacAudioSpecificConfig(sr, 2)];
    const hex = Array.from(esds, (v) => v.toString(16).padStart(2, '0')).join('');
    expect(hex).toContain(`0580808002${asc.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    expect(hex).toContain('0002ee00'.slice(0, 4));
    expect(table(file, child(stbl, 'stts')!, 1, 2)).toEqual([[118, 1024]]);
    const offsets = table(file, child(stbl, 'stco')!, 1, 1).flat();
    expect(offsets.map((o) => file[o])).toEqual([100, 147, 194]);
    expect(child(stbl, 'stss')).toBeUndefined();
  });
});

describe('movieLayout：其他組合', () => {
  it('MOV＋PCM：ftyp qt、hdlr 的元件類型、alis、sowt、每個樣本 4 位元組', () => {
    const vSizes = [30, 31, 32, 33];
    const aSizes = [4 * 3000, 4 * 1000];
    const layout = movieLayout(
      {
        codec: 'avc1',
        config: new Uint8Array([1, 0x42, 0, 0x1e, 0xff, 0xe1, 0]),
        width: 64,
        height: 32,
        fps: 2,
        sizes: vSizes,
      },
      { codec: 'pcm', sampleRate: 3000, channels: 2, sizes: aSizes, durations: [3000, 1000] },
      { container: 'mov' },
    );
    const file = assemble(layout, vSizes, aSizes);
    const boxes = parse(file);
    expect(ascii(file, 8)).toBe('qt  ');
    const [video, audio] = traks(boxes);
    const hdlr = find(video.children, ['mdia', 'hdlr']);
    expect(ascii(file, hdlr.start + 12)).toBe('mhlr');
    expect(ascii(file, hdlr.start + 16)).toBe('vide');
    expect(file[hdlr.start + 32]).toBe(5);
    expect(ascii(file, hdlr.start + 33, 5)).toBe('Video');
    const minf = find(video.children, ['mdia', 'minf']);
    expect(minf.children.map((x) => x.type)).toEqual(['vmhd', 'hdlr', 'dinf', 'stbl']);
    const dref = child(child(minf, 'dinf')!, 'dref')!;
    expect(ascii(file, dref.start + 20)).toBe('alis');
    const stbl = stblOf(audio);
    expect(ascii(file, child(stbl, 'stsd')!.start + 20)).toBe('sowt');
    const stsz = child(stbl, 'stsz')!;
    expect([u32(file, stsz.start + 12), u32(file, stsz.start + 16)]).toEqual([4, 4000]);
    expect(table(file, child(stbl, 'stts')!, 1, 2)).toEqual([[4000, 1]]);
    expect(table(file, child(stbl, 'stsc')!, 1, 3)).toEqual([
      [1, 3000, 1],
      [2, 1000, 1],
    ]);
    const offsets = table(file, child(stbl, 'stco')!, 1, 1).flat();
    expect(offsets.map((o) => file[o])).toEqual([100, 101]);
  });

  it('PCM 不能放在 MP4', () => {
    expect(() =>
      movieLayout(
        { codec: 'avc1', config: new Uint8Array(7), width: 2, height: 2, fps: 1, sizes: [1] },
        { codec: 'pcm', sampleRate: 8000, channels: 2, sizes: [4], durations: [1] },
      ),
    ).toThrow();
  });

  it('VP9＋Opus：vp09＋vpcC、Opus＋dOps（OpusHead 的 pre-skip 換成 big-endian）', () => {
    const head = new Uint8Array([
      ...[...'OpusHead'].map((c) => c.charCodeAt(0)),
      1,
      2,
      0x38,
      0x01,
      0x80,
      0xbb,
      0,
      0,
      0,
      0,
      0,
    ]);
    expect(parseOpusHead(head)).toEqual({
      channels: 2,
      preSkip: 312,
      inputSampleRate: 48000,
      outputGain: 0,
    });
    const vpcC = vpcCFor('vp09.00.40.08', {
      primaries: 'smpte170m',
      transfer: 'smpte170m',
      matrix: 'smpte170m',
      fullRange: false,
    });
    expect([...vpcC]).toEqual([0, 40, 0x82, 6, 6, 6, 0, 0]);
    const layout = movieLayout(
      { codec: 'vp09', config: vpcC, width: 640, height: 360, fps: 30, sizes: [10, 11] },
      {
        codec: 'opus',
        sampleRate: 48000,
        channels: 2,
        config: head,
        sizes: [5, 6, 7],
        durations: [960, 960, 960],
      },
    );
    const file = assemble(layout, [10, 11], [5, 6, 7]);
    const [video, audio] = traks(parse(file));
    const vs = child(stblOf(video), 'stsd')!;
    expect(ascii(file, vs.start + 20)).toBe('vp09');
    const vpcBox = file.subarray(vs.start + 16 + 86);
    expect(ascii(vpcBox, 4)).toBe('vpcC');
    expect(vpcBox[8]).toBe(1);
    expect([...vpcBox.subarray(12, 20)]).toEqual([...vpcC]);
    const as = child(stblOf(audio), 'stsd')!;
    expect(ascii(file, as.start + 20)).toBe('Opus');
    expect(u32(file, as.start + 16 + 32)).toBe(48000 * 65536);
    const dOps = file.subarray(as.start + 16 + 36);
    expect(ascii(dOps, 4)).toBe('dOps');
    expect([...dOps.subarray(8, 19)]).toEqual([0, 2, 0x01, 0x38, 0, 0, 0xbb, 0x80, 0, 0, 0]);
  });

  it('顯示順序與解碼順序不同（B 影格）：ctts（平移成非負）＋edts', () => {
    const sizes = [10, 10, 10, 10];
    const layout = movieLayout({
      codec: 'avc1',
      config: new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0]),
      width: 16,
      height: 16,
      fps: 25,
      sizes,
      compositionOffsets: [0, 2, -1, -1],
    });
    const file = assemble(layout, sizes, []);
    const [video] = traks(parse(file));
    expect(table(file, child(stblOf(video), 'ctts')!, 1, 2)).toEqual([
      [1, 1],
      [1, 3],
      [2, 0],
    ]);
    const elst = find(video.children, ['edts', 'elst']);
    expect([
      u32(file, elst.start + 12),
      u32(file, elst.start + 16),
      u32(file, elst.start + 20),
    ]).toEqual([1, 4, 1]);
  });

  it('AAC 的 AudioSpecificConfig、VP9 的等級', () => {
    expect([...aacAudioSpecificConfig(48000, 2)]).toEqual([0x11, 0x90]);
    expect([...aacAudioSpecificConfig(44100, 2)]).toEqual([0x12, 0x10]);
    expect(() => aacAudioSpecificConfig(12345, 2)).toThrow();
    expect(vp9Level(1920, 1080, 30)).toBe(40);
    expect(vp9Level(1920, 1080, 60)).toBe(41);
    expect(vp9Level(640, 360, 30)).toBe(21);
  });
});

/* ---------- 模擬的 WebCodecs ---------- */

interface MockSupport {
  avc?: (codec: string) => boolean;
  vp9?: boolean;
  aac?: boolean;
  opus?: boolean;
}

function installCodecs(support: MockSupport) {
  const encodedFrames: { keyFrame: boolean; timestamp: number }[] = [];
  const audioFrames: number[] = [];
  class MockVideoFrame {
    timestamp: number;
    constructor(_src: unknown, init: { timestamp: number }) {
      this.timestamp = init.timestamp;
    }
    close() {}
  }
  class MockVideoEncoder {
    state = 'unconfigured';
    encodeQueueSize = 0;
    private config: VideoEncoderConfig | null = null;
    private n = 0;
    constructor(private init: VideoEncoderInit) {}
    static async isConfigSupported(c: VideoEncoderConfig) {
      const codec = String(c.codec);
      const ok = codec.startsWith('avc1')
        ? !!support.avc?.(codec)
        : codec.startsWith('vp09') && !!support.vp9;
      return { supported: ok, config: c };
    }
    configure(c: VideoEncoderConfig) {
      this.config = c;
      this.state = 'configured';
    }
    encode(frame: MockVideoFrame, opt?: { keyFrame?: boolean }) {
      const i = this.n++;
      encodedFrames.push({ keyFrame: !!opt?.keyFrame, timestamp: frame.timestamp });
      const isAvc = String(this.config?.codec).startsWith('avc1');
      const chunk = {
        type: opt?.keyFrame ? 'key' : 'delta',
        timestamp: frame.timestamp,
        byteLength: 20 + (i % 7),
        copyTo(dst: Uint8Array) {
          dst.fill(i % 100);
        },
      };
      const meta =
        i === 0
          ? {
              decoderConfig: {
                codec: String(this.config?.codec),
                description: isAvc ? new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0]) : undefined,
                colorSpace: isAvc
                  ? undefined
                  : { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
              },
            }
          : undefined;
      queueMicrotask(() =>
        this.init.output(chunk as unknown as EncodedVideoChunk, meta as EncodedVideoChunkMetadata),
      );
    }
    async flush() {
      await Promise.resolve();
    }
    close() {
      this.state = 'closed';
    }
  }
  class MockAudioData {
    numberOfFrames: number;
    timestamp: number;
    constructor(init: { numberOfFrames: number; timestamp: number }) {
      this.numberOfFrames = init.numberOfFrames;
      this.timestamp = init.timestamp;
    }
    close() {}
  }
  class MockAudioEncoder {
    state = 'unconfigured';
    encodeQueueSize = 0;
    private pending = 0;
    private packets = 0;
    private config: AudioEncoderConfig | null = null;
    constructor(private init: AudioEncoderInit) {}
    static async isConfigSupported(c: AudioEncoderConfig) {
      const ok = c.codec === 'opus' ? !!support.opus : !!support.aac;
      return { supported: ok, config: c };
    }
    configure(c: AudioEncoderConfig) {
      this.config = c;
      this.state = 'configured';
    }
    encode(d: MockAudioData) {
      audioFrames.push(d.numberOfFrames);
      this.pending += d.numberOfFrames;
      const size = this.config?.codec === 'opus' ? 960 : 1024;
      while (this.pending >= size) this.emit(size);
    }
    private emit(size: number) {
      this.pending -= size;
      const k = this.packets++;
      const sr = this.config?.sampleRate ?? 48000;
      const chunk = {
        type: 'key',
        timestamp: Math.round(((k * size) / sr) * 1e6),
        duration: Math.round((size / sr) * 1e6),
        byteLength: 9,
        copyTo(dst: Uint8Array) {
          dst.fill(200);
        },
      };
      const meta =
        k === 0
          ? { decoderConfig: { codec: this.config?.codec, sampleRate: sr, numberOfChannels: 2 } }
          : undefined;
      this.init.output(chunk as unknown as EncodedAudioChunk, meta as EncodedAudioChunkMetadata);
    }
    async flush() {
      if (this.pending > 0) this.emit(this.pending);
    }
    close() {
      this.state = 'closed';
    }
  }
  vi.stubGlobal('VideoFrame', MockVideoFrame);
  vi.stubGlobal('VideoEncoder', MockVideoEncoder);
  vi.stubGlobal('AudioData', MockAudioData);
  vi.stubGlobal('AudioEncoder', MockAudioEncoder);
  return { encodedFrames, audioFrames };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findMoviePlan', () => {
  const req = { width: 1920, height: 1080, fps: 30, bitrate: 12e6 };
  it('沒有 WebCodecs 時 null', async () => {
    expect(await findMoviePlan(req)).toBeNull();
  });
  it('H.264＋AAC → MP4；profile 依指定的順序（先 High）；44.1／48 kHz 照原本', async () => {
    installCodecs({ avc: () => true, aac: true });
    const plan = await findMoviePlan({
      ...req,
      audio: { sampleRate: 44100 },
      profiles: ['high', 'main', 'baseline'],
    });
    expect(plan?.container).toBe('mp4');
    expect(plan?.video.codec).toBe('avc1');
    expect(plan?.video.config.codec).toBe('avc1.640028');
    expect(plan?.video.config.bitrate).toBe(12e6);
    expect(plan?.audio).toMatchObject({ codec: 'aac', sampleRate: 44100, bitrate: 192000 });
    const other = await findMoviePlan({ ...req, audio: { sampleRate: 32000 } });
    expect(other?.audio?.sampleRate).toBe(48000);
    expect(other?.video.config.codec).toBe('avc1.420028');
  });
  it('60 FPS 的 1080p 用 4.2 等級', async () => {
    installCodecs({ avc: () => true });
    const plan = await findMoviePlan({ ...req, fps: 60, bitrate: 18e6, profiles: ['high'] });
    expect(plan?.video.config.codec).toBe('avc1.64002a');
  });
  it('有 H.264 沒有 AAC → MOV＋PCM（取樣率照原本）', async () => {
    installCodecs({ avc: () => true, aac: false, opus: true });
    const plan = await findMoviePlan({ ...req, audio: { sampleRate: 22050 } });
    expect(plan).toMatchObject({ container: 'mov', extension: 'mov', mimeType: 'video/quicktime' });
    expect(plan?.audio).toMatchObject({ codec: 'pcm', sampleRate: 22050, config: null });
  });
  it('沒有 H.264：videoCodecs 有 vp09 時 VP9＋Opus（48 kHz）的 MP4；沒有 Opus 時 null', async () => {
    installCodecs({ avc: () => false, vp9: true, opus: true });
    expect(await findMoviePlan({ ...req, audio: { sampleRate: 44100 } })).toBeNull();
    const plan = await findMoviePlan({
      ...req,
      audio: { sampleRate: 44100 },
      videoCodecs: ['avc1', 'vp09'],
    });
    expect(plan?.video.config.codec).toBe('vp09.00.40.08');
    expect(plan?.audio).toMatchObject({ codec: 'opus', sampleRate: 48000 });
    vi.unstubAllGlobals();
    installCodecs({ avc: () => false, vp9: true, opus: false });
    expect(
      await findMoviePlan({ ...req, audio: { sampleRate: 44100 }, videoCodecs: ['avc1', 'vp09'] }),
    ).toBeNull();
    const silent = await findMoviePlan({ ...req, videoCodecs: ['avc1', 'vp09'] });
    expect(silent?.video.codec).toBe('vp09');
    expect(silent?.audio).toBeNull();
  });
  it('寬或高是奇數時 null', async () => {
    installCodecs({ avc: () => true });
    expect(await findMoviePlan({ ...req, width: 1921 })).toBeNull();
  });
});

describe('encodeMovie（模擬的編碼器）', () => {
  const canvas = { width: 64, height: 36 } as unknown as HTMLCanvasElement;
  const song = (seconds: number, sr = 48000) => {
    const n = seconds * sr;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin(i / 10) * 0.5;
    return { sampleRate: sr, channels: [a] };
  };

  async function run(plan: MoviePlan, frames: number, audio: boolean, interval = 1) {
    const progress: number[] = [];
    const phases: string[] = [];
    const blob = await encodeMovie({
      plan,
      width: 64,
      height: 36,
      fps: 10,
      frameCount: frames,
      renderFrame: () => canvas,
      audio: audio ? { pcm: song(3), start: 0.5, end: 0.5 + frames / 10 } : null,
      keyFrameInterval: interval,
      onProgress: (d) => progress.push(d),
      onPhase: (p) => phases.push(p),
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type, progress, phases };
  }

  it('H.264＋AAC：關鍵影格的間隔、影格數、聲音的長度、資料依區塊排好', async () => {
    const { encodedFrames, audioFrames } = installCodecs({ avc: () => true, aac: true });
    const plan = (await findMoviePlan({
      width: 64,
      height: 36,
      fps: 10,
      audio: { sampleRate: 48000 },
    }))!;
    const r = await run(plan, 25, true, 20);
    expect(r.type).toBe('video/mp4');
    expect(r.phases).toEqual(['audio', 'video']);
    expect(r.progress.at(-1)).toBe(25);
    expect(encodedFrames.map((f) => f.keyFrame).flatMap((k, i) => (k ? [i] : []))).toEqual([0, 20]);
    expect(audioFrames.reduce((a, b) => a + b, 0)).toBe(2.5 * 48000);
    const boxes = parse(r.bytes);
    const [video, audio] = traks(boxes);
    expect(table(r.bytes, child(stblOf(video), 'stss')!, 1, 1).flat()).toEqual([1, 21]);
    expect(u32(r.bytes, child(stblOf(video), 'stsz')!.start + 16)).toBe(25);
    const stts = table(r.bytes, child(stblOf(audio), 'stts')!, 1, 2);
    expect(stts.reduce((s, [c, d]) => s + c * d, 0)).toBe(2.5 * 48000);
    const vOffsets = table(r.bytes, child(stblOf(video), 'stco')!, 1, 1).flat();
    expect(vOffsets.map((o) => r.bytes[o])).toEqual([0, 10, 20]);
    const aOffsets = table(r.bytes, child(stblOf(audio), 'stco')!, 1, 1).flat();
    expect(aOffsets.map((o) => r.bytes[o])).toEqual([200, 200, 200]);
  });

  it('沒有 AAC → MOV＋PCM：聲音是 16 位元的雙聲道（單聲道複製）', async () => {
    installCodecs({ avc: () => true, aac: false });
    const plan = (await findMoviePlan({
      width: 64,
      height: 36,
      fps: 10,
      audio: { sampleRate: 48000 },
    }))!;
    const r = await run(plan, 15, true);
    expect(r.type).toBe('video/quicktime');
    const [, audio] = traks(parse(r.bytes));
    const stbl = stblOf(audio);
    expect(u32(r.bytes, child(stbl, 'stsz')!.start + 16)).toBe(1.5 * 48000);
    const [first] = table(r.bytes, child(stbl, 'stco')!, 1, 1).flat();
    const view = new DataView(r.bytes.buffer, first);
    /* 第一個取樣：0.5 秒處的值，左右相同 */
    const expected = Math.round(Math.fround(Math.sin(24000 / 10) * 0.5) * 32767);
    expect([view.getInt16(0, true), view.getInt16(2, true)]).toEqual([expected, expected]);
  });

  it('VP9＋Opus：vpcC 依編碼器回報的色彩；Opus 的取樣率 48 kHz', async () => {
    installCodecs({ avc: () => false, vp9: true, opus: true });
    const plan = (await findMoviePlan({
      width: 64,
      height: 36,
      fps: 10,
      audio: { sampleRate: 48000 },
      videoCodecs: ['avc1', 'vp09'],
    }))!;
    const r = await run(plan, 10, true, 5);
    const [video, audio] = traks(parse(r.bytes));
    const vs = child(stblOf(video), 'stsd')!;
    expect(ascii(r.bytes, vs.start + 20)).toBe('vp09');
    expect(ascii(r.bytes, child(stblOf(audio), 'stsd')!.start + 20)).toBe('Opus');
    expect(table(r.bytes, child(stblOf(video), 'stss')!, 1, 1).flat()).toEqual([1, 6]);
  });

  it('沒有聲音、取消、聲音設定不一致', async () => {
    installCodecs({ avc: () => true });
    const plan = (await findMoviePlan({ width: 64, height: 36, fps: 10 }))!;
    const r = await run(plan, 3, false);
    expect(traks(parse(r.bytes))).toHaveLength(1);
    await expect(run(plan, 3, true)).rejects.toMatchObject({ code: 'bad-options' });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      encodeMovie({
        plan,
        width: 64,
        height: 36,
        fps: 10,
        frameCount: 3,
        renderFrame: () => canvas,
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('pickRecordingType', () => {
  const stub = (ok: (t: string) => boolean) =>
    vi.stubGlobal('MediaRecorder', { isTypeSupported: ok } as unknown as typeof MediaRecorder);
  it('不給參數時與以前相同（先 WebM）；preferMp4 先試 H.264 的 MP4；audio 時含聲音的候選', () => {
    stub((t) => t === 'video/webm;codecs=vp9' || t.startsWith('video/mp4'));
    expect(pickRecordingType()).toBe('video/webm;codecs=vp9');
    expect(pickRecordingType({ preferMp4: true })).toBe('video/mp4;codecs=avc1.640032');
    expect(pickRecordingType({ preferMp4: true, audio: true })).toBe(
      'video/mp4;codecs=avc1.640032,mp4a.40.2',
    );
    stub((t) => t === 'video/webm;codecs=vp8,opus');
    expect(pickRecordingType({ preferMp4: true, audio: true })).toBe('video/webm;codecs=vp8,opus');
    stub(() => {
      throw new Error('不支援');
    });
    expect(pickRecordingType({ preferMp4: true })).toBe('');
  });
});
