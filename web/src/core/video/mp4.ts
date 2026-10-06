/**
 * MP4／MOV 的封裝（純函式，Node 也能跑；music-frame 移植時把 character-select 的單軌 MP4 擴充成這個模組）：
 *
 * - 影像軌：H.264（`avc1`＋avcC）或 VP9（`vp09`＋vpcC）；時間單位＝FPS（每格 1 個單位）；可以有非關鍵影格（stss 只列關鍵影格）
 *   與顯示順序不同的影格（ctts＋edts）。
 * - 聲音軌（選填）：AAC（`mp4a`＋esds）、Opus（`Opus`＋dOps）、16 位元 PCM（`sowt`，只在 MOV）；時間單位＝取樣率。
 * - 有聲音時兩軌每一秒左右交錯成一個區塊（stsc＋stco）；沒有聲音時影像全部是一個區塊（與舊的 `mp4Header` 逐位元組相同）。
 * - 容器：`mp4`（ftyp isom）或 `mov`（ftyp qt、hdlr 的元件類型、資料參照用 alis）。
 *
 * ```ts
 * const layout = movieLayout(
 *   { codec: 'avc1', config: avcC, width: 1920, height: 1080, fps: 30, sizes, keyFrames },
 *   { codec: 'aac', sampleRate: 48000, channels: 2, config: asc, sizes: aacSizes, durations: aacDurations },
 * );
 * const parts = [layout.head, ...layout.chunks.flatMap((c) => samplesOf(c.track).slice(c.first, c.first + c.count))];
 * ```
 */

export type MovieVideoCodec = 'avc1' | 'vp09';
export type MovieAudioCodec = 'aac' | 'opus' | 'pcm';
export type MovieContainer = 'mp4' | 'mov';

export interface MuxVideoTrack {
  codec: MovieVideoCodec;
  /** avc1：avcC（AVCDecoderConfigurationRecord）；vp09：vpcC 的內容（不含 FullBox 的 4 位元組，見 `vpcCFor`） */
  config: Uint8Array;
  width: number;
  height: number;
  /** 每秒格數（也是影像軌的時間單位） */
  fps: number;
  /** 每格的位元組數（解碼順序） */
  sizes: readonly number[];
  /** 每格是不是關鍵影格（不給＝全部都是） */
  keyFrames?: readonly boolean[] | null;
  /** 每格的「顯示的格數 − 解碼的格數」（不給＝全部 0） */
  compositionOffsets?: readonly number[] | null;
}

export interface MuxAudioTrack {
  codec: MovieAudioCodec;
  sampleRate: number;
  channels: number;
  /**
   * aac：AudioSpecificConfig（不給時依取樣率與聲道數產生 AAC-LC 的）；
   * opus：編碼器給的 OpusHead（不給時 pre-skip 0）；pcm：不用。
   */
  config?: Uint8Array | null;
  /** aac／opus：每個封包的位元組數；pcm：每一段的位元組數（每個取樣 聲道數 × 2 位元組，little-endian） */
  sizes: readonly number[];
  /** 每個封包（pcm：每一段）的長度（取樣數） */
  durations: readonly number[];
  /** esds 寫的位元率（bps，預設 192,000） */
  bitrate?: number;
}

export interface MovieLayoutOptions {
  container?: MovieContainer;
}

export interface MovieChunk {
  track: 'video' | 'audio';
  /** 這一軌的第幾個樣本（pcm：第幾段）開始 */
  first: number;
  count: number;
}

export interface MovieLayout {
  /** ftyp＋moov＋mdat 的標頭 */
  head: Uint8Array;
  /** 依檔案順序接在 head 後面的資料 */
  chunks: MovieChunk[];
  /** 整個檔案的大小 */
  size: number;
}

/* ---------- 位元組小工具 ---------- */

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function ints(values: readonly number[], bytes: 1 | 2 | 4): Uint8Array {
  const out = new Uint8Array(values.length * bytes);
  const v = new DataView(out.buffer);
  values.forEach((x, i) => {
    if (bytes === 1) v.setUint8(i, x & 0xff);
    else if (bytes === 2) v.setUint16(i * 2, x & 0xffff);
    else v.setUint32(i * 4, x >>> 0);
  });
  return out;
}
const u8 = (...v: number[]) => ints(v, 1);
const u16 = (...v: number[]) => ints(v, 2);
const u32 = (...v: number[]) => ints(v, 4);
/** 很長的陣列（每格的大小等）不要用展開，避免超過函式參數的上限 */
const u32List = (v: readonly number[]) => ints(v, 4);
const zeros = (n: number) => new Uint8Array(n);

const box = (type: string, ...parts: Uint8Array[]) =>
  concatBytes([u32(8 + parts.reduce((n, p) => n + p.byteLength, 0)), ascii(type), ...parts]);
const fullBox = (type: string, versionFlags: number, ...parts: Uint8Array[]) =>
  box(type, u32(versionFlags), ...parts);
/** 單位矩陣（16.16、16.16、2.30） */
const unityMatrix = () => u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

/** 連續相同的值合併成 [次數, 值] */
function runs(values: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const x of values) {
    const last = out[out.length - 1];
    if (last && last[1] === x) last[0]++;
    else out.push([1, x]);
  }
  return out;
}

/** MPEG-4 的描述子（長度一律寫成 4 位元組） */
function descriptor(tag: number, body: Uint8Array): Uint8Array {
  const n = body.byteLength;
  return concatBytes([
    u8(
      tag,
      0x80 | ((n >> 21) & 0x7f),
      0x80 | ((n >> 14) & 0x7f),
      0x80 | ((n >> 7) & 0x7f),
      n & 0x7f,
    ),
    body,
  ]);
}

const AAC_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000,
];

/** AAC-LC 的 AudioSpecificConfig（2 位元組）；不支援的取樣率丟錯 */
export function aacAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const fi = AAC_RATES.indexOf(sampleRate);
  if (fi < 0) throw new RangeError(`AAC 不支援 ${sampleRate} Hz`);
  return u8((2 << 3) | (fi >> 1), ((fi & 1) << 7) | ((channels & 0xf) << 3));
}

/** OpusHead（little-endian）→ dOps 的欄位；不是 OpusHead 時 null */
export function parseOpusHead(
  head: Uint8Array | null | undefined,
): { channels: number; preSkip: number; inputSampleRate: number; outputGain: number } | null {
  if (!head || head.byteLength < 19 || String.fromCharCode(...head.subarray(0, 8)) !== 'OpusHead')
    return null;
  const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return {
    channels: head[9],
    preSkip: v.getUint16(10, true),
    inputSampleRate: v.getUint32(12, true),
    outputGain: v.getInt16(16, true),
  };
}

/** VP9 的等級（依畫面大小與每秒的像素量；回傳 10～62，例如 40＝4.0） */
export function vp9Level(width: number, height: number, fps: number): number {
  const size = width * height;
  const rate = size * fps;
  const table: [number, number, number][] = [
    [10, 36864, 829440],
    [11, 73728, 2764800],
    [20, 122880, 4608000],
    [21, 245760, 9216000],
    [30, 552960, 20736000],
    [31, 983040, 36864000],
    [40, 2228224, 83558400],
    [41, 2228224, 160432128],
    [50, 8912896, 311951360],
    [51, 8912896, 588251136],
    [52, 8912896, 1176502272],
    [60, 35651584, 1176502272],
    [61, 35651584, 2353004544],
    [62, 35651584, 4706009088],
  ];
  return (table.find(([, s, r]) => size <= s && rate <= r) ?? table[table.length - 1])[0];
}

const PRIMARIES: Record<string, number> = {
  bt709: 1,
  bt470bg: 5,
  smpte170m: 6,
  bt2020: 9,
  smpte432: 12,
};
const TRANSFER: Record<string, number> = {
  bt709: 1,
  smpte170m: 6,
  linear: 8,
  'iec61966-2-1': 13,
  pq: 16,
  hlg: 18,
};
const MATRIX: Record<string, number> = {
  rgb: 0,
  bt709: 1,
  bt470bg: 5,
  smpte170m: 6,
  'bt2020-ncl': 9,
};

/**
 * vpcC 的內容（版本 1，不含 FullBox 的 4 位元組）：由編碼字串（`vp09.PP.LL.DD`）取 profile、level、位元深度，
 * 色彩由編碼器回報的 colorSpace 換成代碼（不知道時 BT.709）；色度 4:2:0。
 */
export function vpcCFor(
  codec: string,
  colorSpace?: {
    primaries?: string | null;
    transfer?: string | null;
    matrix?: string | null;
    fullRange?: boolean | null;
  } | null,
): Uint8Array {
  const m = /^vp09\.(\d{2})\.(\d{2})\.(\d{2})/.exec(codec);
  const profile = m ? Number(m[1]) : 0;
  const level = m ? Number(m[2]) : 40;
  const depth = m ? Number(m[3]) : 8;
  return concatBytes([
    u8(
      profile,
      level,
      ((depth & 0xf) << 4) | (1 << 1) | (colorSpace?.fullRange ? 1 : 0),
      PRIMARIES[colorSpace?.primaries ?? ''] ?? 1,
      TRANSFER[colorSpace?.transfer ?? ''] ?? 1,
      MATRIX[colorSpace?.matrix ?? ''] ?? 1,
    ),
    u16(0),
  ]);
}

/* ---------- 各個 box ---------- */

function handler(container: MovieContainer, type: 'vide' | 'soun', name: string): Uint8Array {
  if (container === 'mov') {
    const nm = ascii(name);
    return fullBox('hdlr', 0, ascii('mhlr'), ascii(type), zeros(12), u8(nm.byteLength), nm);
  }
  return fullBox('hdlr', 0, u32(0), ascii(type), zeros(12), ascii(`${name}\0`));
}

function dataInfo(container: MovieContainer): Uint8Array {
  return box('dinf', fullBox('dref', 0, u32(1), fullBox(container === 'mov' ? 'alis' : 'url ', 1)));
}

/** MOV 的 minf 裡多一個資料參照的 hdlr */
const dataHandler = (container: MovieContainer) =>
  container === 'mov'
    ? [fullBox('hdlr', 0, ascii('dhlr'), ascii('alis'), zeros(12), u8(11), ascii('DataHandler'))]
    : [];

/** stsc：每個區塊有幾個樣本（相同的連續區塊合併） */
function sampleToChunk(counts: readonly number[]): Uint8Array {
  const entries: number[] = [];
  let last = -1;
  counts.forEach((n, i) => {
    if (n === last) return;
    entries.push(i + 1, n, 1);
    last = n;
  });
  return fullBox('stsc', 0, u32(entries.length / 3), u32List(entries));
}

function videoSampleEntry(v: MuxVideoTrack): Uint8Array {
  const tail = v.codec === 'vp09' ? fullBox('vpcC', 0x01000000, v.config) : box('avcC', v.config);
  return box(
    v.codec,
    zeros(6),
    u16(1),
    zeros(16),
    u16(v.width, v.height),
    u32(0x480000, 0x480000, 0),
    u16(1),
    zeros(32),
    u16(24, 0xffff),
    tail,
  );
}

function audioSampleEntry(a: MuxAudioTrack, trackId: number): Uint8Array {
  const common = (type: string, rate: number, ...rest: Uint8Array[]) =>
    box(type, zeros(6), u16(1), zeros(8), u16(a.channels, 16, 0, 0), u32(rate * 65536), ...rest);
  if (a.codec === 'pcm') return common('sowt', a.sampleRate);
  if (a.codec === 'opus') {
    const head = parseOpusHead(a.config);
    const dOps = box(
      'dOps',
      u8(0, a.channels),
      u16(head?.preSkip ?? 0),
      u32(head?.inputSampleRate ?? a.sampleRate),
      u16(head?.outputGain ?? 0),
      u8(0),
    );
    return common('Opus', 48000, dOps);
  }
  const asc = a.config?.byteLength ? a.config : aacAudioSpecificConfig(a.sampleRate, a.channels);
  const bitrate = a.bitrate ?? 192_000;
  const esds = fullBox(
    'esds',
    0,
    descriptor(
      3,
      concatBytes([
        u16(trackId),
        u8(0),
        descriptor(
          4,
          concatBytes([u8(0x40, 0x15, 0, 0, 0), u32(bitrate, bitrate), descriptor(5, asc)]),
        ),
        descriptor(6, u8(2)),
      ]),
    ),
  );
  return common('mp4a', a.sampleRate, esds);
}

/** 依檔案順序的區塊：沒有聲音時影像一個區塊；有聲音時各約 1 秒、交錯 */
function planChunks(v: MuxVideoTrack, a: MuxAudioTrack | null | undefined): MovieChunk[] {
  const n = v.sizes.length;
  if (!a) return [{ track: 'video', first: 0, count: n }];
  const vChunks: MovieChunk[] = [];
  const per = Math.max(1, Math.round(v.fps));
  for (let i = 0; i < n; i += per)
    vChunks.push({ track: 'video', first: i, count: Math.min(per, n - i) });
  const aChunks: MovieChunk[] = [];
  if (a.codec === 'pcm') {
    for (let i = 0; i < a.sizes.length; i++) aChunks.push({ track: 'audio', first: i, count: 1 });
  } else {
    let i = 0;
    while (i < a.sizes.length) {
      let d = 0;
      let k = 0;
      while (i + k < a.sizes.length && d < a.sampleRate) {
        d += a.durations[i + k];
        k++;
      }
      aChunks.push({ track: 'audio', first: i, count: k });
      i += k;
    }
  }
  const out: MovieChunk[] = [];
  for (let k = 0; k < Math.max(vChunks.length, aChunks.length); k++) {
    if (vChunks[k]) out.push(vChunks[k]);
    if (aChunks[k]) out.push(aChunks[k]);
  }
  return out;
}

const chunkBytes = (c: MovieChunk, v: MuxVideoTrack, a: MuxAudioTrack | null | undefined) => {
  const sizes = c.track === 'video' ? v.sizes : (a?.sizes ?? []);
  let b = 0;
  for (let j = 0; j < c.count; j++) b += sizes[c.first + j];
  return b;
};

function moov(
  v: MuxVideoTrack,
  a: MuxAudioTrack | null | undefined,
  container: MovieContainer,
  chunks: readonly MovieChunk[],
  offsets: readonly number[],
): Uint8Array {
  const n = v.sizes.length;
  const audioSamples = a ? a.durations.reduce((s, d) => s + d, 0) : 0;
  const audioMovie = a ? Math.round((audioSamples / a.sampleRate) * v.fps) : 0;
  const movieDuration = Math.max(n, audioMovie);
  const mvhd = fullBox(
    'mvhd',
    0,
    u32(0, 0, v.fps, movieDuration, 0x10000),
    u16(0x100, 0),
    zeros(8),
    unityMatrix(),
    zeros(24),
    u32(a ? 3 : 2),
  );

  /* ---- 影像軌 ---- */
  const vIdx = chunks.map((c, i) => (c.track === 'video' ? i : -1)).filter((i) => i >= 0);
  const keyList = v.keyFrames
    ? v.keyFrames.flatMap((k, i) => (k ? [i + 1] : []))
    : Array.from({ length: n }, (_, i) => i + 1);
  const comp = v.compositionOffsets ?? null;
  const hasComp = !!comp && comp.some((x) => x !== 0);
  let shift = 0;
  if (hasComp) for (const x of comp) shift = Math.max(shift, -x);
  const cttsRuns = hasComp ? runs(comp.map((x) => x + shift)) : [];
  const ctts = hasComp ? [fullBox('ctts', 0, u32(cttsRuns.length), u32List(cttsRuns.flat()))] : [];
  const stco = (idx: number[]) =>
    fullBox('stco', 0, u32(idx.length), u32List(idx.map((i) => offsets[i])));
  const vstbl = box(
    'stbl',
    fullBox('stsd', 0, u32(1), videoSampleEntry(v)),
    fullBox('stts', 0, u32(1, n, 1)),
    ...ctts,
    sampleToChunk(vIdx.map((i) => chunks[i].count)),
    fullBox('stsz', 0, u32(0, n), u32List(v.sizes)),
    stco(vIdx),
    fullBox('stss', 0, u32(keyList.length), u32List(keyList)),
  );
  const tkhdV = fullBox(
    'tkhd',
    7,
    u32(0, 0, 1, 0, n),
    zeros(8),
    u16(0, 0, 0, 0),
    unityMatrix(),
    u32(v.width * 65536, v.height * 65536),
  );
  const edts = shift ? [box('edts', fullBox('elst', 0, u32(1, n, shift), u16(1, 0)))] : [];
  const vtrak = box(
    'trak',
    tkhdV,
    ...edts,
    box(
      'mdia',
      fullBox('mdhd', 0, u32(0, 0, v.fps, n), u16(0x55c4, 0)),
      handler(container, 'vide', 'Video'),
      box(
        'minf',
        fullBox('vmhd', 1, u16(0, 0, 0, 0)),
        ...dataHandler(container),
        dataInfo(container),
        vstbl,
      ),
    ),
  );
  if (!a) return box('moov', mvhd, vtrak);

  /* ---- 聲音軌 ---- */
  const aIdx = chunks.map((c, i) => (c.track === 'audio' ? i : -1)).filter((i) => i >= 0);
  const pcm = a.codec === 'pcm';
  const stts = pcm
    ? fullBox('stts', 0, u32(1, audioSamples, 1))
    : fullBox('stts', 0, u32(runs(a.durations).length), u32List(runs(a.durations).flat()));
  const stsz = pcm
    ? fullBox('stsz', 0, u32(a.channels * 2, audioSamples))
    : fullBox('stsz', 0, u32(0, a.sizes.length), u32List(a.sizes));
  const astbl = box(
    'stbl',
    fullBox('stsd', 0, u32(1), audioSampleEntry(a, 2)),
    stts,
    sampleToChunk(aIdx.map((i) => (pcm ? a.durations[chunks[i].first] : chunks[i].count))),
    stsz,
    stco(aIdx),
  );
  const tkhdA = fullBox(
    'tkhd',
    7,
    u32(0, 0, 2, 0, audioMovie),
    zeros(8),
    u16(0, 0, 0x100, 0),
    unityMatrix(),
    u32(0, 0),
  );
  const atrak = box(
    'trak',
    tkhdA,
    box(
      'mdia',
      fullBox('mdhd', 0, u32(0, 0, a.sampleRate, audioSamples), u16(0x55c4, 0)),
      handler(container, 'soun', 'Sound'),
      box(
        'minf',
        fullBox('smhd', 0, u16(0, 0)),
        ...dataHandler(container),
        dataInfo(container),
        astbl,
      ),
    ),
  );
  return box('moov', mvhd, vtrak, atrak);
}

/**
 * MP4／MOV 的檔頭與資料的順序：檔案＝[head, ...每個區塊的樣本（依 chunks 的順序）]。
 * PCM 聲音只能放在 MOV（MP4 時丟錯）。
 */
export function movieLayout(
  video: MuxVideoTrack,
  audio?: MuxAudioTrack | null,
  { container = 'mp4' }: MovieLayoutOptions = {},
): MovieLayout {
  if (audio?.codec === 'pcm' && container !== 'mov') throw new Error('PCM 聲音只能放在 MOV');
  if (audio && audio.sizes.length !== audio.durations.length)
    throw new Error('聲音的大小與長度數量不同');
  const ftyp =
    container === 'mov'
      ? box('ftyp', ascii('qt  '), u32(0x200), ascii('qt  '))
      : box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
  const chunks = planChunks(video, audio);
  const sizes = chunks.map((c) => chunkBytes(c, video, audio));
  const media = sizes.reduce((s, x) => s + x, 0);
  const probe = moov(
    video,
    audio,
    container,
    chunks,
    chunks.map(() => 0),
  );
  let p = ftyp.byteLength + probe.byteLength + 8;
  const offsets = sizes.map((s) => {
    const o = p;
    p += s;
    return o;
  });
  const head = concatBytes([
    ftyp,
    moov(video, audio, container, chunks, offsets),
    u32(media + 8),
    ascii('mdat'),
  ]);
  return { head, chunks, size: head.byteLength + media };
}
