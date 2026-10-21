/**
 * WebM 的封裝（純函式；lyric-fx 移植時新增，給透明 WebM 用：規格 docs/refactor/specs/lyric-fx.md 3.9.2）。
 *
 * - EBML 檔頭（DocType webm、DocTypeVersion 4、DocTypeReadVersion 2）＋已知長度的 Segment：
 *   SeekHead（Info、Tracks、Cues）、Info（TimecodeScale 1 ms、Duration、MuxingApp、WritingApp）、Tracks、Cluster…、Cues。
 * - 影像軌 1（V_VP9／V_VP8、DefaultDuration、寬高、Colour：BT.709 有限範圍）；有透明度時 AlphaMode 1、MaxBlockAdditionID 1，
 *   每一格是 BlockGroup：Block＋BlockAdditions › BlockMore（BlockAddID 1、BlockAdditional＝透明度那一路的資料），
 *   不是關鍵影格時加 ReferenceBlock（指向前一格）。沒有透明度時是 SimpleBlock。
 * - 聲音軌 2（A_OPUS、CodecPrivate＝OpusHead、CodecDelay、SeekPreRoll 80 ms、取樣率、聲道數），SimpleBlock。
 * - Cluster：每個關鍵影格開一個（相對時間超過 30 秒時也開新的），影像與聲音依時間交錯；Cues：每個以關鍵影格開始的 Cluster 一個。
 * 影格資料不複製：回傳的 parts 直接放原本的 Uint8Array／Blob（`new Blob(parts)` 就是檔案）。
 */

export type WebmData = Uint8Array | Blob;

export interface WebmVideoFrame {
  data: WebmData;
  /** 透明度那一路（AlphaMode 1 時每一格都要有） */
  alpha?: WebmData | null;
  key: boolean;
  /** 毫秒 */
  timestampMs: number;
}

export interface WebmAudioFrame {
  data: WebmData;
  timestampMs: number;
}

export interface WebmMuxInput {
  width: number;
  height: number;
  fps: number;
  codec: 'V_VP9' | 'V_VP8';
  /** 每一格帶透明度 */
  alpha?: boolean;
  /** 總長（毫秒） */
  durationMs: number;
  video: readonly WebmVideoFrame[];
  audio?: {
    /** OpusHead（19 位元組以上） */
    codecPrivate: Uint8Array;
    sampleRate: number;
    channels: number;
    /** 預先略過的取樣數（OpusHead 的 pre-skip） */
    preSkip: number;
    frames: readonly WebmAudioFrame[];
  } | null;
  app?: string;
}

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  SeekPreRoll: 0x56bb,
  DefaultDuration: 0x23e383,
  MaxBlockAdditionID: 0x55ee,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  AlphaMode: 0x53c0,
  Colour: 0x55b0,
  MatrixCoefficients: 0x55b1,
  Range: 0x55b9,
  TransferCharacteristics: 0x55ba,
  Primaries: 0x55bb,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockAdditions: 0x75a1,
  BlockMore: 0xa6,
  BlockAddID: 0xee,
  BlockAdditional: 0xa5,
  ReferenceBlock: 0xfb,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
} as const;

/* ---------- 位元組 ---------- */

const sizeOf = (d: WebmData) => (d instanceof Uint8Array ? d.byteLength : d.size);

/** 元素 ID 的位元組（ID 本身已含長度標記） */
function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  let v = id;
  while (v > 0) {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Uint8Array.from(out);
}

/** 長度欄（最短的寫法；全部是 1 的值保留給「未知長度」，所以那種情況多用一個位元組） */
export function vintSize(n: number): Uint8Array {
  for (let len = 1; len <= 8; len++) {
    const max = 2 ** (7 * len) - 1;
    if (n < max) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v % 256;
        v = Math.floor(v / 256);
      }
      out[0] |= 0x80 >> (len - 1);
      return out;
    }
  }
  throw new Error('WebM 的元素太大');
}

function uintBytes(v: number, minLen = 1): Uint8Array {
  const out: number[] = [];
  let x = Math.max(0, Math.floor(v));
  while (x > 0) {
    out.unshift(x % 256);
    x = Math.floor(x / 256);
  }
  while (out.length < minLen) out.unshift(0);
  return Uint8Array.from(out);
}

function intBytes(v: number): Uint8Array {
  const x = Math.trunc(v);
  for (let len = 1; len <= 8; len++) {
    const lim = 2 ** (8 * len - 1);
    if (x >= -lim && x < lim) {
      const out = new Uint8Array(len);
      let u = x < 0 ? 2 ** (8 * len) + x : x;
      for (let i = len - 1; i >= 0; i--) {
        out[i] = u % 256;
        u = Math.floor(u / 256);
      }
      return out;
    }
  }
  throw new Error('數值太大');
}

const floatBytes = (v: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, v, false);
  return out;
};

const utf8 = (s: string) => new TextEncoder().encode(s);

/** 一個元素：parts＝[ID＋長度, ...內容] */
interface Node {
  parts: WebmData[];
  size: number;
}

function el(id: number, children: readonly (Node | WebmData)[]): Node {
  const body: WebmData[] = [];
  let n = 0;
  for (const c of children) {
    if (c instanceof Uint8Array || (typeof Blob !== 'undefined' && c instanceof Blob)) {
      body.push(c);
      n += sizeOf(c);
    } else {
      const node = c as Node;
      body.push(...node.parts);
      n += node.size;
    }
  }
  const head = new Uint8Array([...idBytes(id), ...vintSize(n)]);
  return { parts: [head, ...body], size: head.byteLength + n };
}

const uel = (id: number, v: number, minLen = 1) => el(id, [uintBytes(v, minLen)]);
const fel = (id: number, v: number) => el(id, [floatBytes(v)]);
const sel = (id: number, s: string) => el(id, [utf8(s)]);

/* ---------- 封裝 ---------- */

interface Block {
  track: 1 | 2;
  ms: number;
  video?: WebmVideoFrame;
  /** 前一格的時間（ReferenceBlock 用） */
  prevMs?: number;
  audio?: WebmAudioFrame;
}

function blockHeader(track: number, rel: number, flags: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = 0x80 | track;
  new DataView(out.buffer).setInt16(1, rel, false);
  out[3] = flags;
  return out;
}

/** 封裝成 WebM：回傳依序接起來就是檔案的 parts */
export function muxWebm(input: WebmMuxInput): WebmData[] {
  const { width, height, fps, codec, durationMs } = input;
  const alpha = !!input.alpha;
  const audio = input.audio ?? null;
  const app = input.app ?? 'trpg-toolkit';

  const ebml = el(ID.EBML, [
    uel(ID.EBMLVersion, 1),
    uel(ID.EBMLReadVersion, 1),
    uel(ID.EBMLMaxIDLength, 4),
    uel(ID.EBMLMaxSizeLength, 8),
    sel(ID.DocType, 'webm'),
    uel(ID.DocTypeVersion, 4),
    uel(ID.DocTypeReadVersion, 2),
  ]);

  const info = el(ID.Info, [
    uel(ID.TimecodeScale, 1_000_000),
    fel(ID.Duration, Math.max(0, durationMs)),
    sel(ID.MuxingApp, app),
    sel(ID.WritingApp, app),
  ]);

  const videoTrack = el(ID.TrackEntry, [
    uel(ID.TrackNumber, 1),
    uel(ID.TrackUID, 1),
    uel(ID.TrackType, 1),
    uel(ID.FlagLacing, 0),
    sel(ID.CodecID, codec),
    uel(ID.DefaultDuration, Math.round(1e9 / fps)),
    ...(alpha ? [uel(ID.MaxBlockAdditionID, 1)] : []),
    el(ID.Video, [
      uel(ID.PixelWidth, width),
      uel(ID.PixelHeight, height),
      ...(alpha ? [uel(ID.AlphaMode, 1)] : []),
      el(ID.Colour, [
        uel(ID.MatrixCoefficients, 1),
        uel(ID.Range, 1),
        uel(ID.TransferCharacteristics, 1),
        uel(ID.Primaries, 1),
      ]),
    ]),
  ]);
  const tracks = el(ID.Tracks, [
    videoTrack,
    ...(audio
      ? [
          el(ID.TrackEntry, [
            uel(ID.TrackNumber, 2),
            uel(ID.TrackUID, 2),
            uel(ID.TrackType, 2),
            uel(ID.FlagLacing, 0),
            sel(ID.CodecID, 'A_OPUS'),
            el(ID.CodecPrivate, [audio.codecPrivate]),
            uel(ID.CodecDelay, Math.round((audio.preSkip / 48000) * 1e9)),
            uel(ID.SeekPreRoll, 80_000_000),
            el(ID.Audio, [fel(ID.SamplingFrequency, audio.sampleRate), uel(ID.Channels, audio.channels)]),
          ]),
        ]
      : []),
  ]);

  /* 所有區塊依時間排（同時間：影像在前） */
  const blocks: Block[] = [];
  input.video.forEach((f, i) =>
    blocks.push({ track: 1, ms: Math.round(f.timestampMs), video: f, prevMs: i ? Math.round(input.video[i - 1].timestampMs) : undefined }),
  );
  for (const a of audio?.frames ?? []) blocks.push({ track: 2, ms: Math.max(0, Math.round(a.timestampMs)), audio: a });
  blocks.sort((a, b) => a.ms - b.ms || a.track - b.track);

  /* 分成 Cluster */
  const clusters: { ms: number; key: boolean; blocks: Block[] }[] = [];
  for (const b of blocks) {
    let c = clusters[clusters.length - 1];
    const startKey = b.track === 1 && !!b.video?.key;
    if (!c || (startKey && c.blocks.some((x) => x.track === 1)) || b.ms - c.ms > 30_000) {
      c = { ms: b.ms, key: startKey, blocks: [] };
      clusters.push(c);
    } else if (startKey && !c.key && !c.blocks.some((x) => x.track === 1)) c.key = true;
    c.blocks.push(b);
  }

  const clusterNodes = clusters.map((c) =>
    el(ID.Cluster, [
      uel(ID.Timecode, c.ms),
      ...c.blocks.map((b) => {
        const rel = b.ms - c.ms;
        if (b.track === 2 && b.audio) {
          const head = blockHeader(2, rel, 0x80);
          return el(ID.SimpleBlock, [head, b.audio.data]);
        }
        const f = b.video as WebmVideoFrame;
        if (!alpha) return el(ID.SimpleBlock, [blockHeader(1, rel, f.key ? 0x80 : 0), f.data]);
        const parts: Node[] = [el(ID.Block, [blockHeader(1, rel, 0), f.data])];
        if (f.alpha)
          parts.push(
            el(ID.BlockAdditions, [el(ID.BlockMore, [uel(ID.BlockAddID, 1), el(ID.BlockAdditional, [f.alpha])])]),
          );
        if (!f.key && b.prevMs !== undefined)
          parts.push(el(ID.ReferenceBlock, [intBytes(Math.min(-1, b.prevMs - b.ms))]));
        return el(ID.BlockGroup, parts);
      }),
    ]),
  );

  /* 位置（相對 Segment 的資料開頭）：SeekHead 的位置欄固定 8 位元組，長度與內容無關 */
  const seekEntry = (id: number, pos: number) =>
    el(ID.Seek, [el(ID.SeekID, [idBytes(id)]), uel(ID.SeekPosition, pos, 8)]);
  const seekSize = el(ID.SeekHead, [seekEntry(ID.Info, 0), seekEntry(ID.Tracks, 0), seekEntry(ID.Cues, 0)]).size;
  const infoPos = seekSize;
  const tracksPos = infoPos + info.size;
  let pos = tracksPos + tracks.size;
  const cuePoints: Node[] = [];
  clusters.forEach((c, i) => {
    if (c.key) {
      cuePoints.push(
        el(ID.CuePoint, [
          uel(ID.CueTime, c.ms),
          el(ID.CueTrackPositions, [uel(ID.CueTrack, 1), uel(ID.CueClusterPosition, pos)]),
        ]),
      );
    }
    pos += clusterNodes[i].size;
  });
  const cuesPos = pos;
  const cues = el(ID.Cues, cuePoints);
  const seekHead = el(ID.SeekHead, [
    seekEntry(ID.Info, infoPos),
    seekEntry(ID.Tracks, tracksPos),
    seekEntry(ID.Cues, cuesPos),
  ]);
  const segment = el(ID.Segment, [seekHead, info, tracks, ...clusterNodes, cues]);
  return [...ebml.parts, ...segment.parts];
}

/** OpusHead（19 位元組：版本 1、聲道數、pre-skip、原本的取樣率、增益 0、對應方式 0） */
export function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const out = new Uint8Array(19);
  out.set(utf8('OpusHead'), 0);
  const v = new DataView(out.buffer);
  out[8] = 1;
  out[9] = channels;
  v.setUint16(10, preSkip, true);
  v.setUint32(12, inputRate, true);
  v.setInt16(16, 0, true);
  out[18] = 0;
  return out;
}
