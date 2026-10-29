/**
 * 環境音混音器的資料：混音的狀態（軌、總音量、匯出設定）、整理（存檔、網址讀回來時）、預設組合、隨機組合、
 * 分享連結的格式、檔名。純函式，Node 可測。規格：docs/refactor/specs/ambience-mixer.md。
 */

import type { AudioFileType } from '@/core/audio';
import {
  type AmbienceParams,
  ambienceSound,
  defaultParams,
  isAmbienceSoundId,
  sanitizeParams,
  volumeGain,
} from '@/core/audio/ambience';
import { safeFileName } from '@/core/files';
import { readShareHash, type Schema, sh } from '@/core/share';

export const TOOL_ID = 'ambience-mixer';

/* ---------- 軌 ---------- */

export interface SynthTrack {
  kind: 'synth';
  /** 軌的 id（`s:<聲音 id>`；同一個聲音只有一軌） */
  key: string;
  sound: string;
  /** 音量 0～100 */
  volume: number;
  params: AmbienceParams;
  /** 音量慢慢起伏 */
  swell: boolean;
  /** 變化的種子（「換一種變化」換這個） */
  seed: number;
}

export interface FileTrack {
  kind: 'file';
  /** 軌的 id（`f<n>`） */
  key: string;
  /** 音檔在這個瀏覽器的 IndexedDB 裡的 id */
  asset: string;
  name: string;
  /** 長度（秒，顯示用） */
  duration: number;
  volume: number;
  swell: boolean;
  /** 循環播放（關：只播一次） */
  loop: boolean;
  /** 循環時接縫的交叉淡化（秒） */
  seam: number;
  /** 只播一次時的淡入、淡出（秒） */
  fadeIn: number;
  fadeOut: number;
}

export type Track = SynthTrack | FileTrack;

export const EXPORT_LENGTHS = [10, 20, 30, 60, 90, 120, 180] as const;
export const EXPORT_RATES = [44100, 32000, 22050] as const;
export type ExportRate = (typeof EXPORT_RATES)[number];

export interface ExportSettings {
  /** 秒數（10 的倍數：起伏的週期是 10 秒） */
  seconds: number;
  sampleRate: ExportRate;
  channels: 1 | 2;
}

export interface MixState {
  tracks: Track[];
  /** 總音量 0～100 */
  master: number;
  export: ExportSettings;
  /** 套用的組合名稱（匯出的檔名用；加入或拿掉聲音時清掉） */
  mixName: string;
}

/** 同時最多幾軌（每一軌的預覽約佔 15 MB 記憶體） */
export const MAX_TRACKS = 12;
/** 自己的音檔最多幾軌 */
export const MAX_FILE_TRACKS = 6;
/** 自己的音檔的大小上限（位元組） */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
/**
 * 自己的音檔解碼後的長度上限（秒）：解碼後是 44.1 kHz 的浮點數，每分鐘的立體聲約 21 MB，15 分鐘約 318 MB；
 * 再長的話一個分頁就要好幾 GB 的記憶體（驗證時 64 分鐘的檔案讓分頁到 2.75 GB）。
 */
export const FILE_MAX_SECONDS = 15 * 60;
/** 超過長度上限（多 1 秒的寬容：剛好 15 分鐘的檔案不會因為編碼的填充被擋掉） */
export const fileTooLong = (seconds: number): boolean => seconds > FILE_MAX_SECONDS + 1;
/**
 * 自己的音檔解碼後的**總長度**上限（秒）：依軌的順序累計，超過的不載入。每個 15 分鐘、六個加起來會到 1.9 GB
 * （驗證時六個 14 分 50 秒的立體聲讓分頁到約 2 GB、重新整理時峰值 3.8 GB）；30 分鐘的立體聲解碼後約 635 MB。
 */
export const FILES_TOTAL_SECONDS = 30 * 60;
/** 超過總長度上限（多 2 秒的寬容：兩個剛好 15 分鐘的音檔） */
export const filesTotalTooLong = (seconds: number): boolean => seconds > FILES_TOTAL_SECONDS + 2;

/**
 * 依軌的順序累計自己的音檔的長度，回傳累計起來超過總長度上限、不載入的軌。
 * 太長的（fileTooLong）與 skip 的（找不到、解不開：不佔記憶體）不算；length 是每一軌算幾秒（預設存檔裡的長度）。
 */
export function overTotalKeys(
  tracks: readonly Track[],
  o: { length?: (t: FileTrack) => number; skip?: (t: FileTrack) => boolean } = {},
): Set<string> {
  const over = new Set<string>();
  let total = 0;
  for (const t of tracks) {
    if (t.kind !== 'file' || fileTooLong(t.duration) || o.skip?.(t)) continue;
    const d = o.length ? o.length(t) : t.duration;
    if (filesTotalTooLong(total + d)) over.add(t.key);
    else total += d;
  }
  return over;
}

/** 目前載入的自己的音檔加起來幾秒（不算太長、超過總長度的，與 skip 的：找不到、解不開） */
export function filesInUse(
  tracks: readonly Track[],
  skip: (t: FileTrack) => boolean = () => false,
): number {
  const over = overTotalKeys(tracks, { skip });
  let total = 0;
  for (const t of tracks)
    if (t.kind === 'file' && !fileTooLong(t.duration) && !skip(t) && !over.has(t.key))
      total += t.duration;
  return total;
}

/**
 * 音檔長度的文字（無條件進位到整秒，不會和上限看起來一樣）：「64 分鐘」「15 分 2 秒」「40 秒」。
 */
export function lengthText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (!m) return `${r} 秒`;
  return r ? `${m} 分 ${r} 秒` : `${m} 分鐘`;
}

/**
 * 讀不到長度時（WAV 檔頭、`<audio>` 的 metadata 都讀不到）用檔案大小估：
 * - 每種格式保守的**最高**位元率（位元組／秒）：檔案大小 ÷ 它＝最短可能的長度；連這樣都超過上限 → 一定太長，直接擋。
 *   MP3 320 kbps；Ogg（Vorbis、Opus）、WebM 512 kbps；AAC／M4A 576 kbps（48 kHz 立體聲的上限）；
 *   WAV、FLAC 與認不得的照未壓縮的 192 kHz、32 位元、立體聲（實際上不會因此擋掉）。
 * - 保守的**最低**位元率 6 kbps（Opus 的下限）：檔案大小 ÷ 它＝最長可能的長度；不超過上限 → 不可能太長，直接解碼。
 * - 介於兩者之間：可能太長，先問（解碼後才知道，太長的話解碼時很佔記憶體）。
 * MP3 開頭的 ID3 標籤（可能有封面圖）不算在內。
 */
export const MAX_BYTE_RATE: Record<AudioFileType, number> = {
  mp3: 40_000,
  ogg: 64_000,
  webm: 64_000,
  aac: 72_000,
  m4a: 72_000,
  wav: 1_536_000,
  flac: 1_536_000,
};
export const UNKNOWN_BYTE_RATE = 1_536_000;
export const MIN_BYTE_RATE = 750;

/** MP3 開頭的 ID3v2 標籤的位元組數（沒有時 0） */
export function id3Size(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const n =
    ((head[6] & 0x7f) << 21) |
    ((head[7] & 0x7f) << 14) |
    ((head[8] & 0x7f) << 7) |
    (head[9] & 0x7f);
  return 10 + n + (head[5] & 0x10 ? 10 : 0);
}

export type UnknownLength =
  | { kind: 'block'; atLeast: number }
  | { kind: 'ask'; atLeast: number; atMost: number }
  | { kind: 'decode' };

/** 讀不到長度時怎麼辦（上面的規則）；head：檔案開頭（至少 10 位元組） */
export function unknownLength(
  size: number,
  head: Uint8Array,
  type: AudioFileType | null,
): UnknownLength {
  const payload = Math.max(0, size - (type === 'mp3' ? id3Size(head) : 0));
  const atLeast = payload / (type ? MAX_BYTE_RATE[type] : UNKNOWN_BYTE_RATE);
  const atMost = payload / MIN_BYTE_RATE;
  if (fileTooLong(atLeast)) return { kind: 'block', atLeast };
  if (!fileTooLong(atMost)) return { kind: 'decode' };
  return { kind: 'ask', atLeast, atMost };
}
/** 太短的音檔（解碼後）不收：循環起來只是一連串的雜音 */
export const FILE_MIN_SECONDS = 0.5;
/** 自己的音檔解碼成這個取樣率（預覽直接播它、匯出時由 Web Audio 換成匯出的取樣率） */
export const FILE_DECODE_RATE = 44100;

export const DEFAULT_VOLUME = 70;
export const DEFAULT_MASTER = 100;
/**
 * 總音量 → 增益：平方再乘 2（每個聲音單獨都留了不少餘裕，幾軌混在一起時才是適當的音量；
 * 太大聲的瞬間由主輸出的柔和限幅壓下來）。100% ＝ 2 倍、71% ≒ 1 倍。
 */
export const MASTER_BOOST = 2;
export const masterGain = (m: number): number => MASTER_BOOST * volumeGain(m);
export const DEFAULT_SEED = 1;
export const SEAM_MAX = 5;
export const FADE_MAX = 10;

/** 預覽的長度與取樣率（＝匯出的預設值：照預設匯出時和預覽聽到的一模一樣） */
export const PREVIEW_SECONDS = 60;
export const PREVIEW_RATE: ExportRate = 32000;

export const DEFAULT_EXPORT: ExportSettings = {
  seconds: PREVIEW_SECONDS,
  sampleRate: PREVIEW_RATE,
  channels: 2,
};

export const initialState: MixState = {
  tracks: [],
  master: DEFAULT_MASTER,
  export: DEFAULT_EXPORT,
  mixName: '',
};

export const synthKey = (sound: string): string => `s:${sound}`;

/** 新的合成軌（參數預設） */
export function newSynthTrack(
  sound: string,
  o: Partial<Omit<SynthTrack, 'kind' | 'key' | 'sound'>> = {},
): SynthTrack | null {
  const def = ambienceSound(sound);
  if (!def) return null;
  return {
    kind: 'synth',
    key: synthKey(sound),
    sound,
    volume: clampInt(o.volume ?? DEFAULT_VOLUME, 0, 100),
    params: sanitizeParams(def, { ...defaultParams(def), ...(o.params ?? {}) }),
    swell: !!o.swell,
    seed: clampInt(o.seed ?? DEFAULT_SEED, 0, 999_999),
  };
}

/** 下一個音檔軌的 id */
export function nextFileKey(tracks: readonly Track[]): string {
  let n = 1;
  for (const t of tracks) {
    if (t.kind !== 'file') continue;
    const m = /^f(\d+)$/.exec(t.key);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `f${n}`;
}

export function newFileTrack(
  tracks: readonly Track[],
  o: { asset: string; name: string; duration: number },
): FileTrack {
  return {
    kind: 'file',
    key: nextFileKey(tracks),
    asset: o.asset,
    name: o.name,
    duration: Math.max(0, o.duration),
    volume: DEFAULT_VOLUME,
    swell: false,
    loop: true,
    seam: 1,
    fadeIn: 0.5,
    fadeOut: 1,
  };
}

/**
 * WAV → 長度（秒）：一個一個區塊往後讀（只讀每個區塊的開頭，data 在很大的 LIST 之後也讀得到），
 * 從 fmt 的每秒位元組數與 data 的大小算（data 的大小不合理時用檔案大小）；不是 WAV 或讀不出來時 null。
 * read(start, end)：讀檔案的一段（Blob.slice 或測試用的陣列）；size：整個檔案的位元組數。
 */
export async function readWavDuration(
  read: (start: number, end: number) => Promise<Uint8Array>,
  size: number,
): Promise<number | null> {
  const head = await read(0, 12);
  if (head.length < 12) return null;
  const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(head, 0) !== 'RIFF' || tag(head, 8) !== 'WAVE') return null;
  let o = 12;
  let byteRate = 0;
  /* 區塊最多看 64 個（正常的 WAV 只有幾個） */
  for (let i = 0; i < 64 && o + 8 <= size; i++) {
    const c = await read(o, o + 20);
    if (c.length < 8) return null;
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    const id = tag(c, 0);
    const len = v.getUint32(4, true);
    if (id === 'fmt ' && c.length >= 20) byteRate = v.getUint32(16, true);
    if (id === 'data') {
      if (!byteRate) return null;
      const rest = Math.max(0, size - (o + 8));
      const bytes = len > 0 && len <= rest ? len : rest;
      return bytes / byteRate;
    }
    o += 8 + len + (len % 2);
  }
  return null;
}

/** 從一段位元組讀（測試、已經在記憶體裡的檔案） */
export const bytesReader =
  (bytes: Uint8Array) =>
  async (start: number, end: number): Promise<Uint8Array> =>
    bytes.subarray(start, Math.min(end, bytes.length));

/* ---------- 整理 ---------- */

const clampInt = (v: unknown, lo: number, hi: number, fallback = lo): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

const clampNum = (v: unknown, lo: number, hi: number, fallback: number, digits = 1): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Number(Math.max(lo, Math.min(hi, n)).toFixed(digits)) : fallback;
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 一軌合成（不認識的聲音 null） */
export function sanitizeSynth(raw: unknown): SynthTrack | null {
  if (!isObj(raw) || !isAmbienceSoundId(raw.sound)) return null;
  const def = ambienceSound(raw.sound);
  if (!def) return null;
  return {
    kind: 'synth',
    key: synthKey(raw.sound),
    sound: raw.sound,
    volume: clampInt(raw.volume, 0, 100, DEFAULT_VOLUME),
    params: sanitizeParams(def, raw.params),
    swell: raw.swell === true,
    seed: clampInt(raw.seed, 0, 999_999, DEFAULT_SEED),
  };
}

export function sanitizeFile(raw: unknown): FileTrack | null {
  if (!isObj(raw) || typeof raw.asset !== 'string' || !raw.asset || typeof raw.key !== 'string')
    return null;
  if (!/^f\d+$/.test(raw.key)) return null;
  return {
    kind: 'file',
    key: raw.key,
    asset: raw.asset.slice(0, 200),
    name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 200) : '音檔',
    duration: clampNum(raw.duration, 0, 24 * 3600, 0, 3),
    volume: clampInt(raw.volume, 0, 100, DEFAULT_VOLUME),
    swell: raw.swell === true,
    loop: raw.loop !== false,
    seam: clampNum(raw.seam, 0, SEAM_MAX, 1),
    fadeIn: clampNum(raw.fadeIn, 0, FADE_MAX, 0.5),
    fadeOut: clampNum(raw.fadeOut, 0, FADE_MAX, 1),
  };
}

/** 軌的清單：合成的同一個聲音只留第一個、音檔的 id 不重複、最多 MAX_TRACKS 軌（音檔最多 MAX_FILE_TRACKS） */
export function sanitizeTracks(raw: unknown): Track[] {
  if (!Array.isArray(raw)) return [];
  const out: Track[] = [];
  const keys = new Set<string>();
  let files = 0;
  for (const r of raw) {
    if (out.length >= MAX_TRACKS) break;
    const t = isObj(r) && r.kind === 'file' ? sanitizeFile(r) : sanitizeSynth(r);
    if (!t || keys.has(t.key)) continue;
    if (t.kind === 'file' && ++files > MAX_FILE_TRACKS) continue;
    keys.add(t.key);
    out.push(t);
  }
  return out;
}

export function sanitizeExport(raw: unknown): ExportSettings {
  const src = isObj(raw) ? raw : {};
  const seconds = (EXPORT_LENGTHS as readonly number[]).includes(Number(src.seconds))
    ? Number(src.seconds)
    : DEFAULT_EXPORT.seconds;
  const sampleRate = (EXPORT_RATES as readonly number[]).includes(Number(src.sampleRate))
    ? (Number(src.sampleRate) as ExportRate)
    : DEFAULT_EXPORT.sampleRate;
  const channels = Number(src.channels) === 1 ? 1 : 2;
  return { seconds, sampleRate, channels };
}

export function sanitizeState(raw: unknown): MixState {
  const src = isObj(raw) ? raw : {};
  return {
    tracks: sanitizeTracks(src.tracks),
    master: clampInt(src.master, 0, 100, DEFAULT_MASTER),
    export: sanitizeExport(src.export),
    mixName: typeof src.mixName === 'string' ? src.mixName.slice(0, 40) : '',
  };
}

/* ---------- 預設組合 ---------- */

export interface MixPresetTrack {
  sound: string;
  volume: number;
  params?: AmbienceParams;
  swell?: boolean;
}

export interface MixPreset {
  id: string;
  name: string;
  description: string;
  tracks: readonly MixPresetTrack[];
}

/** 本站設計的跑團場景 */
export const PRESETS: readonly MixPreset[] = [
  {
    id: 'rainy-mansion',
    name: '雨夜洋館',
    description: '窗外下著雨，壁爐燒著，落地鐘滴答，遠處偶爾打雷。',
    tracks: [
      { sound: 'rain-window', volume: 65, params: { taps: 45, outside: 60 } },
      { sound: 'thunder', volume: 55, params: { frequency: 30, distance: 70 } },
      { sound: 'clock', volume: 50, params: { type: 1, room: 45 } },
      { sound: 'fireplace', volume: 45, params: { intensity: 40, crackle: 35 } },
    ],
  },
  {
    id: 'catacomb',
    name: '地下墓室',
    description: '滴水的石室，低沉的嗡鳴，冷風從縫隙吹過。',
    tracks: [
      { sound: 'cave-drips', volume: 70, params: { rate: 35, echo: 75 } },
      { sound: 'drone', volume: 55, params: { pitch: 25, unease: 55 }, swell: true },
      { sound: 'wind', volume: 35, params: { intensity: 20, howl: 35 } },
    ],
  },
  {
    id: 'seaside-cabin',
    name: '海邊小屋',
    description: '浪打上岸，海風吹著，木屋嘎吱作響，屋裡有壁爐。',
    tracks: [
      { sound: 'waves', volume: 70, params: { size: 55, distance: 45 } },
      { sound: 'wind', volume: 40, params: { intensity: 35, howl: 15 } },
      { sound: 'creak', volume: 45, params: { rate: 25, pitch: 40 } },
      { sound: 'fireplace', volume: 40, params: { intensity: 45, crackle: 40 } },
    ],
  },
  {
    id: 'forest-campfire',
    name: '森林營火',
    description: '夜裡的森林，營火劈啪，草叢裡有蟲，遠處有貓頭鷹。',
    tracks: [
      { sound: 'campfire', volume: 70, params: { intensity: 55, crackle: 55 } },
      { sound: 'crickets', volume: 50, params: { count: 40, far: 50 } },
      { sound: 'owl', volume: 45, params: { rate: 30, distance: 55 } },
      { sound: 'wind', volume: 25, params: { intensity: 20, howl: 0 } },
    ],
  },
  {
    id: 'storm-ship',
    name: '暴風雨的船上',
    description: '大雨、狂風、巨浪，雷就在頭頂，船身不停嘎吱作響。',
    tracks: [
      /* 五軌都很大聲：音量比其他組合低一些（約 −3 dB） */
      { sound: 'rain-heavy', volume: 55, params: { intensity: 75, distance: 20 } },
      { sound: 'wind', volume: 50, params: { intensity: 80, howl: 55 } },
      { sound: 'thunder', volume: 50, params: { frequency: 60, distance: 20 } },
      { sound: 'waves', volume: 46, params: { size: 90, distance: 20 } },
      { sound: 'creak', volume: 46, params: { rate: 70, pitch: 30 } },
    ],
  },
  {
    id: 'night-office',
    name: '深夜的辦公室',
    description: '空無一人的辦公室：空調、日光燈、掛鐘，窗外下著小雨。',
    tracks: [
      { sound: 'office-hum', volume: 65, params: { hum: 50, fan: 55 } },
      { sound: 'clock', volume: 45, params: { type: 0, room: 35 } },
      { sound: 'rain-light', volume: 40, params: { intensity: 35, distance: 70 } },
    ],
  },
  {
    id: 'tavern',
    name: '熱鬧的酒館',
    description: '大家的交談聲、杯盤碰撞，角落的壁爐。',
    tracks: [
      { sound: 'crowd', volume: 70, params: { people: 65, clink: 55, distance: 30 } },
      { sound: 'fireplace', volume: 45, params: { intensity: 50, crackle: 45 } },
    ],
  },
  {
    id: 'study-1920s',
    name: '1920 年代的書房',
    description: '唱機的雜音、時鐘、壁爐，窗外下著雨。',
    tracks: [
      { sound: 'vinyl', volume: 50, params: { crackle: 45, wear: 45 } },
      { sound: 'clock', volume: 40, params: { type: 0, room: 30 } },
      { sound: 'fireplace', volume: 40, params: { intensity: 40, crackle: 35 } },
      { sound: 'rain-window', volume: 35, params: { taps: 25, outside: 45 } },
    ],
  },
  {
    id: 'heartbeat-dark',
    name: '黑暗中的心跳',
    description: '什麼都看不見，只聽得到自己的心跳與不安的低鳴。',
    tracks: [
      { sound: 'heartbeat', volume: 70, params: { bpm: 92, muffle: 50 } },
      { sound: 'drone', volume: 50, params: { pitch: 30, unease: 70 }, swell: true },
      { sound: 'brown-noise', volume: 25, params: { tone: 30 } },
    ],
  },
  {
    id: 'sunken-temple',
    name: '海底神殿',
    description: '深海裡的神殿：水壓的悶響、冒上去的氣泡、遠方的鐘聲。',
    tracks: [
      { sound: 'underwater', volume: 70, params: { bubbles: 45, depth: 70 } },
      { sound: 'drone', volume: 45, params: { pitch: 15, unease: 40 }, swell: true },
      { sound: 'bell', volume: 40, params: { interval: 60, pitch: 20, distance: 85 } },
    ],
  },
];

export const presetById = (id: string): MixPreset | undefined => PRESETS.find((p) => p.id === id);

/** 預設組合 → 合成軌 */
export function presetTracks(p: { tracks: readonly MixPresetTrack[] }): SynthTrack[] {
  const out: SynthTrack[] = [];
  for (const t of p.tracks) {
    const tr = newSynthTrack(t.sound, { volume: t.volume, params: t.params, swell: t.swell });
    if (tr && !out.some((o) => o.key === tr.key)) out.push(tr);
  }
  return out;
}

/**
 * 換掉合成的聲音（套用組合、分享連結、隨機）：自己的音檔留著，排在合成的後面；超過上限的合成軌不加。
 */
export function replaceSynth(tracks: readonly Track[], next: readonly SynthTrack[]): Track[] {
  const files = tracks.filter((t): t is FileTrack => t.kind === 'file');
  const room = Math.max(0, MAX_TRACKS - files.length);
  return [...next.slice(0, room), ...files];
}

/* ---------- 隨機組合 ---------- */

/** 主體（一個）：持續的背景聲 */
const RANDOM_BEDS = [
  'rain-light',
  'rain-heavy',
  'wind',
  'waves',
  'stream',
  'campfire',
  'fireplace',
  'underwater',
  'crowd',
  'office-hum',
  'cave-drips',
] as const;

/** 點綴（一到兩個） */
const RANDOM_ACCENTS = [
  'thunder',
  'rain-window',
  'clock',
  'heartbeat',
  'owl',
  'crickets',
  'creak',
  'bell',
  'vinyl',
  'drone',
  'wind',
] as const;

/** 放在一起不合理的組合（只看主體 → 不能搭的點綴） */
const RANDOM_CONFLICTS: Record<string, readonly string[]> = {
  'rain-light': ['rain-window'],
  'rain-heavy': ['rain-window'],
  wind: ['wind'],
  underwater: ['thunder', 'rain-window', 'clock', 'owl', 'crickets', 'creak', 'vinyl', 'wind'],
  crowd: ['owl', 'crickets', 'heartbeat', 'drone'],
  'office-hum': ['owl', 'crickets', 'creak', 'thunder'],
  'cave-drips': ['clock', 'vinyl', 'crickets', 'rain-window', 'owl'],
  campfire: ['clock', 'vinyl', 'rain-window'],
  waves: ['clock', 'vinyl'],
  stream: ['clock', 'vinyl', 'rain-window'],
  fireplace: [],
};

export type RandomFn = () => number;

/** 某個參數在預設值附近隨機（±25% 的範圍） */
function jitterParams(sound: string, rnd: RandomFn): AmbienceParams {
  const def = ambienceSound(sound);
  if (!def) return {};
  const out: AmbienceParams = {};
  for (const p of def.params) {
    if (p.kind === 'choice') out[p.id] = Math.floor(rnd() * p.options.length);
    else {
      const span = (p.max - p.min) * 0.25;
      out[p.id] = p.default + (rnd() * 2 - 1) * span;
    }
  }
  return sanitizeParams(def, out);
}

/**
 * 隨機組合：一個持續的主體＋一到兩個合得來的點綴，音量與參數在預設值附近隨機（不會出現「水底＋營火」這種組合）。
 */
export function randomMix(rnd: RandomFn = Math.random): SynthTrack[] {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length];
  const bed = pick(RANDOM_BEDS);
  const conflicts = new Set(RANDOM_CONFLICTS[bed] ?? []);
  const pool = RANDOM_ACCENTS.filter((a) => a !== bed && !conflicts.has(a));
  const count = rnd() < 0.55 ? 2 : 1;
  const accents: string[] = [];
  while (accents.length < count && pool.length) {
    const i = Math.floor(rnd() * pool.length) % pool.length;
    accents.push(pool.splice(i, 1)[0]);
  }
  const out: SynthTrack[] = [];
  const bedTrack = newSynthTrack(bed, {
    volume: 55 + Math.round(rnd() * 20),
    params: jitterParams(bed, rnd),
  });
  if (bedTrack) out.push(bedTrack);
  for (const a of accents) {
    const t = newSynthTrack(a, {
      volume: 35 + Math.round(rnd() * 25),
      params: jitterParams(a, rnd),
    });
    if (t) out.push(t);
  }
  return out;
}

/* ---------- 分享連結 ---------- */

export const SHARE_VERSION = 1;
export const SHARE_MAX_LENGTH = 8000;

/** 網址裡一軌的格式：[聲音 id, 音量, 參數, 起伏 0／1, 種子] */
type ShareTrack = [string, number, AmbienceParams, number, number];

export interface ShareData {
  /** 總音量 */
  m: number;
  /** 組合名稱 */
  n: string;
  t: ShareTrack[];
}

/** 目前的狀態 → 分享的資料（只有合成的聲音；自己的音檔不放進網址） */
export function shareData(s: MixState): ShareData {
  return {
    m: s.master,
    n: s.mixName,
    t: s.tracks
      .filter((t): t is SynthTrack => t.kind === 'synth')
      .map((t) => [t.sound, t.volume, t.params, t.swell ? 1 : 0, t.seed]),
  };
}

const shareSchema: Schema<{ m: number; n: string; t: unknown[] }> = sh.object({
  m: sh.number({ min: 0, max: 100, default: DEFAULT_MASTER, int: true }),
  n: sh.string({ default: '', maxLength: 40, maxLines: 1 }),
  t: sh.array({ fallback: null, parse: (v) => v } as Schema<unknown>, {
    default: [],
    maxItems: MAX_TRACKS,
  }),
});

export interface SharedMix {
  master: number;
  mixName: string;
  tracks: SynthTrack[];
}

/** 分享的資料（不可信的輸入）→ 整理過的組合；一個聲音都認不得時 null */
export function parseShareData(raw: unknown): SharedMix | null {
  const d = shareSchema.parse(raw);
  const tracks: SynthTrack[] = [];
  for (const r of d.t) {
    if (!Array.isArray(r)) continue;
    const t = sanitizeSynth({
      sound: r[0],
      volume: r[1],
      params: r[2],
      swell: r[3] === 1,
      seed: r[4],
    });
    if (t && !tracks.some((o) => o.key === t.key)) tracks.push(t);
  }
  if (!tracks.length) return null;
  return { master: d.m, mixName: d.n, tracks };
}

/** 網址的 # → 分享的組合：none（沒有）、broken（壞了、版本不符、一個聲音都認不得）或內容 */
export function readShare(
  hash: string,
): { kind: 'none' } | { kind: 'broken' } | { kind: 'ok'; mix: SharedMix } {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  if (!params.has('s')) return { kind: 'none' };
  /* 空的 #s=：當成壞掉的連結（清掉並通知） */
  if (!params.get('s')) return { kind: 'broken' };
  const raw = readShareHash(hash, { version: SHARE_VERSION, maxLength: SHARE_MAX_LENGTH });
  const mix = raw === null ? null : parseShareData(raw);
  return mix ? { kind: 'ok', mix } : { kind: 'broken' };
}

/* ---------- 名稱與檔名 ---------- */

export function trackLabel(t: Track): string {
  return t.kind === 'synth' ? (ambienceSound(t.sound)?.label ?? t.sound) : t.name;
}

/** 去掉副檔名 */
export const baseName = (name: string): string => name.replace(/\.[^./\\]{1,8}$/, '') || name;

/** 檔案大小（1000 進位，和 CCFOLIA 的「10 MB」同一種算法）：「7.7 MB」「10 MB」「850 KB」 */
export function formatMb(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  return `${(bytes / 1e6).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** 匯出的長度的文字（30 秒、1 分、1 分 30 秒） */
export function lengthLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} 秒`;
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}

/** 匯出的檔名：環境音-<組合名或前三個聲音>-<秒數>秒.wav（skipped：沒有混進去的軌，不列） */
export function exportFileName(s: MixState, skipped: ReadonlySet<string> = new Set()): string {
  const names = s.tracks
    .filter((t) => t.volume > 0 && !skipped.has(t.key))
    .map((t) => (t.kind === 'file' ? baseName(t.name) : trackLabel(t)));
  const label = s.mixName || names.slice(0, 3).join('・') || '混音';
  return `${safeFileName(`環境音-${label}-${s.export.seconds}秒`, { fallback: '環境音', maxLength: 100 })}.wav`;
}
