/**
 * MP3（MPEG-1／2／2.5 Layer III）影格的讀寫（純函式，Node 可測，不需要編碼器）：
 * - 影格的檔頭（版本、位元率、取樣率、聲道、長度）與整個檔案的影格清單；
 * - 「Info」標頭影格（Xing 標頭的 CBR 版本＋LAME 擴充）：影格數、檔案大小、目錄，以及**編碼器延遲與結尾的填充**——
 *   看得懂的解碼器（FFmpeg 系）用它把開頭與結尾多出來的取樣裁掉（無縫播放）；
 * - CRC-16（LAME 標頭用的 CRC-16/ARC）。
 *
 * 格式是公開的事實：ISO/IEC 11172-3、13818-3 的影格檔頭，與 LAME 的「Info Tag」規格（Gabriel Bouvigne）。
 */

/** MPEG-1 Layer III 的位元率（kbps；索引 1～14） */
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] as const;
/** MPEG-2／2.5 Layer III 的位元率 */
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] as const;
const RATES: Record<'1' | '2' | '2.5', readonly number[]> = {
  '1': [44100, 48000, 32000],
  '2': [22050, 24000, 16000],
  '2.5': [11025, 12000, 8000],
};

export type MpegVersion = 1 | 2 | 2.5;

export interface Mp3FrameHeader {
  version: MpegVersion;
  /** kbps */
  bitrate: number;
  sampleRate: number;
  /** 這個影格多一個位元組（填充位元） */
  padding: boolean;
  /** 有 16 位元的 CRC（緊接在檔頭之後） */
  crc: boolean;
  /** 0＝立體聲、1＝聯合立體聲、2＝雙聲道、3＝單聲道 */
  channelMode: number;
  /** 影格的位元組數（含檔頭） */
  length: number;
  /** 每個影格解出來的取樣數：MPEG-1 1152、MPEG-2／2.5 576 */
  samples: number;
  /** side information 的位元組數（MPEG-1：單聲道 17、其他 32；MPEG-2／2.5：9、17） */
  sideInfo: number;
}

export { mp3FrameSamples } from './plan';

/** 這個取樣率可以用的位元率（kbps，CBR） */
export function mp3Bitrates(sampleRate: number): readonly number[] {
  return (sampleRate >= 32000 ? BITRATES_V1 : BITRATES_V2).slice(1);
}

/** 讀 offset 位置的影格檔頭；不是 Layer III 的影格（或保留值）時 null */
export function readMp3Header(bytes: Uint8Array, offset = 0): Mp3FrameHeader | null {
  if (offset + 4 > bytes.length) return null;
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const v = (b1 >> 3) & 3;
  if (v === 1) return null;
  if (((b1 >> 1) & 3) !== 1) return null;
  const version: MpegVersion = v === 3 ? 1 : v === 2 ? 2 : 2.5;
  const bi = b2 >> 4;
  const si = (b2 >> 2) & 3;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const bitrate = (version === 1 ? BITRATES_V1 : BITRATES_V2)[bi];
  const sampleRate = RATES[String(version) as '1' | '2' | '2.5'][si];
  const padding = ((b2 >> 1) & 1) === 1;
  const channelMode = b3 >> 6;
  const mono = channelMode === 3;
  const coef = version === 1 ? 144000 : 72000;
  return {
    version,
    bitrate,
    sampleRate,
    padding,
    crc: (b1 & 1) === 0,
    channelMode,
    length: Math.floor((coef * bitrate) / sampleRate) + (padding ? 1 : 0),
    samples: version === 1 ? 1152 : 576,
    sideInfo: version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17,
  };
}

export interface Mp3Frame {
  offset: number;
  header: Mp3FrameHeader;
}

/** ID3v2 標籤的位元組數（沒有時 0） */
function id3v2Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const n = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7);
  return 10 + (n | (bytes[9] & 0x7f)) + (bytes[5] & 0x10 ? 10 : 0);
}

/** 檔案裡連續的影格（從開頭或 ID3v2 標籤之後開始，遇到不是影格的位元組就停） */
export function listMp3Frames(bytes: Uint8Array): Mp3Frame[] {
  const out: Mp3Frame[] = [];
  let o = id3v2Length(bytes);
  for (;;) {
    const header = readMp3Header(bytes, o);
    if (!header || o + header.length > bytes.length) break;
    out.push({ offset: o, header });
    o += header.length;
  }
  return out;
}

/* ---------- CRC-16/ARC（LAME 標頭） ---------- */

/** 查表（第一次用時才建：只用到大小估計的工具不必帶著它） */
let crcTable: Uint16Array | null = null;
function crcTableOf(): Uint16Array {
  if (crcTable) return crcTable;
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
    t[i] = c;
  }
  crcTable = t;
  return t;
}

/** CRC-16/ARC（多項式 0x8005 反射、初值 0）；crc 給上一段的結果可以接著算 */
export function crc16(bytes: Uint8Array, crc = 0, start = 0, end = bytes.length): number {
  const table = crcTableOf();
  let c = crc & 0xffff;
  for (let i = start; i < end; i++) c = (c >>> 8) ^ table[(c ^ bytes[i]) & 0xff];
  return c;
}

/* ---------- Info 標頭影格 ---------- */

export interface InfoFrameOptions {
  /** 第一個聲音影格的檔頭 4 個位元組（照它的版本、取樣率、聲道寫標頭影格） */
  firstHeader: Uint8Array;
  /** 聲音影格的數目（不含標頭影格） */
  frames: number;
  /** 聲音影格的總位元組數 */
  audioBytes: number;
  /** 編碼器延遲（取樣數，0～4095）：解碼器再多裁 529 個（解碼器自己的延遲） */
  delay: number;
  /** 結尾的填充（取樣數，0～4095）：影格數 × 每格取樣數 − 延遲 − 填充＝真正的長度 */
  padding: number;
  /** 指定的位元率（kbps） */
  bitrate: number;
  /** 聲音影格的 CRC-16（LAME 標頭的 Music CRC） */
  musicCrc: number;
  /** 編碼器的短版本字串（9 個字元以內；預設 LAME3.98r，lamejs 移植的 LAME 版本） */
  encoder?: string;
}

/** Info 標頭在影格裡的位置與用到的長度：檔頭 4 ＋ side information ＋ Info 120 ＋ LAME 36 */
const TAG_BYTES = 120 + 36;

/**
 * 寫一個「Info」標頭影格（CBR 的 Xing 標頭＋LAME 擴充；解碼出來是靜音、看得懂的解碼器不會播它）。
 * 影格的位元率照第一個聲音影格（放不下標頭時改用放得下的最小位元率）、不填充、沒有 CRC。
 */
export function mp3InfoFrame(o: InfoFrameOptions): Uint8Array {
  const ref = readMp3Header(o.firstHeader, 0);
  if (!ref) throw new Error('不是 MP3 的影格檔頭');
  if (!(o.delay >= 0 && o.delay <= 4095 && o.padding >= 0 && o.padding <= 4095))
    throw new Error('編碼器延遲與填充要在 0～4095');
  const table = ref.version === 1 ? BITRATES_V1 : BITRATES_V2;
  const coef = ref.version === 1 ? 144000 : 72000;
  const need = 4 + ref.sideInfo + TAG_BYTES;
  let bi = table.indexOf(ref.bitrate as never);
  while (bi < 14 && Math.floor((coef * table[bi]) / ref.sampleRate) < need) bi++;
  const length = Math.floor((coef * table[bi]) / ref.sampleRate);
  if (length < need) throw new Error('影格放不下 Info 標頭');
  const f = new Uint8Array(length);
  f[0] = 0xff;
  /* 沒有 CRC（保護位元＝1） */
  f[1] = o.firstHeader[1] | 1;
  /* 位元率索引、取樣率照原本、不填充、私有位元 0 */
  f[2] = (bi << 4) | (o.firstHeader[2] & 0x0c);
  f[3] = o.firstHeader[3];
  const v = new DataView(f.buffer);
  let p = 4 + ref.sideInfo;
  const tagStart = p;
  const ascii = (s: string, at: number) => {
    for (let i = 0; i < s.length; i++) f[at + i] = s.charCodeAt(i) & 0x7f;
  };
  const total = length + o.audioBytes;
  ascii('Info', p);
  /* 影格數、位元組數、目錄、品質都有 */
  v.setUint32(p + 4, 0x0f);
  v.setUint32(p + 8, o.frames >>> 0);
  v.setUint32(p + 12, total >>> 0);
  /* 目錄（CBR：位置和時間成正比） */
  for (let i = 0; i < 100; i++) f[p + 16 + i] = Math.floor((i * 256) / 100);
  v.setUint32(p + 116, 0);
  p = tagStart + 120;
  ascii((o.encoder ?? 'LAME3.98r').slice(0, 9).padEnd(9, ' '), p);
  /* 標頭版本 0、VBR 方法 1（CBR） */
  f[p + 9] = 0x01;
  /* 低通（未知）、峰值、兩個 ReplayGain、編碼旗標與 ATH 都留 0 */
  f[p + 20] = Math.max(0, Math.min(255, Math.round(o.bitrate)));
  f[p + 21] = (o.delay >> 4) & 0xff;
  f[p + 22] = ((o.delay & 0x0f) << 4) | ((o.padding >> 8) & 0x0f);
  f[p + 23] = o.padding & 0xff;
  /* misc：原始的取樣率（00＝32 kHz 以下、01＝44.1 kHz）與聲道（0＝單聲道、1＝立體聲） */
  const srcFreq =
    ref.sampleRate > 48000 ? 3 : ref.sampleRate === 48000 ? 2 : ref.sampleRate === 44100 ? 1 : 0;
  const stereoMode =
    ref.channelMode === 3 ? 0 : ref.channelMode === 1 ? 3 : ref.channelMode === 2 ? 2 : 1;
  f[p + 24] = (srcFreq << 6) | (stereoMode << 2);
  v.setUint32(p + 28, total >>> 0);
  v.setUint16(p + 32, o.musicCrc & 0xffff);
  v.setUint16(p + 34, crc16(f, 0, 0, p + 34));
  return f;
}

/** 讀回 Info／Xing 標頭（測試、檢查用）；沒有時 null */
export function readMp3InfoTag(bytes: Uint8Array): {
  kind: 'Info' | 'Xing';
  frames: number;
  bytes: number;
  encoder: string;
  delay: number;
  padding: number;
  tagCrcOk: boolean;
  musicCrc: number;
  frameLength: number;
} | null {
  const first = listMp3Frames(bytes)[0];
  if (!first) return null;
  const { offset, header } = first;
  const p = offset + 4 + (header.crc ? 2 : 0) + header.sideInfo;
  const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
  if (tag !== 'Info' && tag !== 'Xing') return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = v.getUint32(p + 4);
  let q = p + 8;
  const frames = flags & 1 ? v.getUint32(q) : 0;
  if (flags & 1) q += 4;
  const size = flags & 2 ? v.getUint32(q) : 0;
  if (flags & 2) q += 4;
  if (flags & 4) q += 100;
  if (flags & 8) q += 4;
  const encoder = String.fromCharCode(...bytes.subarray(q, q + 9));
  const d = (bytes[q + 21] << 16) | (bytes[q + 22] << 8) | bytes[q + 23];
  return {
    kind: tag,
    frames,
    bytes: size,
    encoder,
    delay: d >> 12,
    padding: d & 0xfff,
    tagCrcOk: v.getUint16(q + 34) === crc16(bytes, 0, offset, q + 34),
    musicCrc: v.getUint16(q + 32),
    frameLength: header.length,
  };
}
