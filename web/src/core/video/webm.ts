/**
 * 即時錄影的 WebM 補上總長。MediaRecorder 分段錄（start(timeslice)）的 WebM 是「直播」格式：Segment 與 Cluster 長度未知、
 * Segment › Info 沒有 Duration，播放器打開時不知道多長（`<video>` 的 duration 是 Infinity，要跳到尾端才算得出來；
 * 有些播放器的拖桿、上傳平台會出問題）。錄完把 Duration 寫進 Info：
 * - 總長＝給的毫秒數，沒給＝所有區塊（SimpleBlock／Block）裡最後一格的時間（Chromium 不分段錄時自己寫的也是這個值）。
 * - Info 裡沒有 Duration：插一個 8 位元組浮點數的 Duration（多 11 個位元組），Info 的長度跟著改；Segment 是已知長度時也跟著加長。
 *   有 SeekHead 或 Cues 的檔（位置表記的是 Segment 裡的位移，插進去會失準）不插，原封不動。
 * - 已經有 Duration：給了總長＝照原位改寫（長度不變）；沒給＝不動。
 * - 讀不懂（不是 EBML、截斷）＝原封不動。Cluster 的資料一律不碰（新的 Blob 直接接回原本後面的部分，不另外複製）。
 * 純函式（讀寫位元組），有單元測試（tests/unit/core-video-webm.test.ts）。
 */

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  Cues: 0x1c53bb6b,
  Tags: 0x1254c367,
  Chapters: 0x1043a770,
  Attachments: 0x1941a469,
} as const;

/** Segment 底下的頂層元素（未知長度的 Cluster 遇到這些就結束） */
const TOP_LEVEL = new Set<number>([
  ID.SeekHead,
  ID.Info,
  ID.Tracks,
  ID.Cluster,
  ID.Cues,
  ID.Tags,
  ID.Chapters,
  ID.Attachments,
]);

interface El {
  id: number;
  /** 元素開頭（ID 的位置） */
  start: number;
  /** 長度欄的位置與位元組數 */
  sizeAt: number;
  sizeLen: number;
  /** 資料的開頭、長度（未知長度＝null） */
  data: number;
  size: number | null;
}

/** EBML 可變長度整數的位元組數（第一個位元組前面有幾個 0 ＋ 1；不合法＝0） */
function vintLen(first: number): number {
  for (let l = 1; l <= 8; l++) if (first & (0x100 >> l)) return l;
  return 0;
}

/** 讀一個元素的 ID 與長度（讀不到＝null） */
function readEl(b: Uint8Array, p: number): El | null {
  if (p >= b.length) return null;
  const il = vintLen(b[p]);
  if (!il || il > 4 || p + il > b.length) return null;
  let id = 0;
  for (let i = 0; i < il; i++) id = id * 256 + b[p + i];
  const sp = p + il;
  if (sp >= b.length) return null;
  const sl = vintLen(b[sp]);
  if (!sl || sp + sl > b.length) return null;
  let size = b[sp] & (0xff >> sl);
  let allOnes = size === 0xff >> sl;
  for (let i = 1; i < sl; i++) {
    size = size * 256 + b[sp + i];
    if (b[sp + i] !== 0xff) allOnes = false;
  }
  return { id, start: p, sizeAt: sp, sizeLen: sl, data: sp + sl, size: allOnes ? null : size };
}

const readUint = (b: Uint8Array, p: number, n: number) => {
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
  return v;
};

const readFloat = (b: Uint8Array, p: number, n: number): number | null => {
  const dv = new DataView(b.buffer, b.byteOffset + p, n);
  return n === 8 ? dv.getFloat64(0) : n === 4 ? dv.getFloat32(0) : null;
};

interface Layout {
  segment: El;
  segEnd: number;
  info: El | null;
  /** Info 裡的 TimecodeScale（奈秒；預設 100 萬＝毫秒）與 Duration */
  scale: number;
  duration: El | null;
  /** 有沒有 SeekHead、Cues（記 Segment 位移的位置表） */
  positional: boolean;
  /** 最後一格的時間（TimecodeScale 的單位；沒有區塊＝null） */
  lastTicks: number | null;
}

function parse(b: Uint8Array): Layout | null {
  const head = readEl(b, 0);
  if (!head || head.id !== ID.EBML || head.size === null) return null;
  const segment = readEl(b, head.data + head.size);
  if (!segment || segment.id !== ID.Segment) return null;
  const segEnd = segment.size === null ? b.length : Math.min(b.length, segment.data + segment.size);
  let info: El | null = null;
  let positional = false;
  let lastTicks: number | null = null;
  const blockAt = (tc: number, p: number, end: number) => {
    /* 區塊：軌道編號（可變長度）＋相對時間（有號 16 位元） */
    const tl = vintLen(b[p]);
    if (!tl || p + tl + 2 > end) return;
    const rel = (((b[p + tl] << 8) | b[p + tl + 1]) << 16) >> 16;
    const t = tc + rel;
    if (lastTicks === null || t > lastTicks) lastTicks = t;
  };
  const cluster = (c: El): number => {
    const end = c.size === null ? segEnd : Math.min(segEnd, c.data + c.size);
    let tc = 0;
    let q = c.data;
    while (q < end) {
      const e = readEl(b, q);
      if (!e) return end;
      if (c.size === null && TOP_LEVEL.has(e.id)) return q;
      const eEnd = e.size === null ? end : Math.min(end, e.data + e.size);
      if (e.id === ID.Timecode && e.size !== null) tc = readUint(b, e.data, Math.min(8, e.size));
      else if (e.id === ID.SimpleBlock) blockAt(tc, e.data, eEnd);
      else if (e.id === ID.BlockGroup) {
        for (let r = e.data; r < eEnd; ) {
          const g = readEl(b, r);
          if (!g || g.size === null) break;
          if (g.id === ID.Block) blockAt(tc, g.data, Math.min(eEnd, g.data + g.size));
          r = g.data + g.size;
        }
      }
      if (e.size === null) return end;
      q = e.data + e.size;
    }
    return end;
  };
  let p = segment.data;
  while (p < segEnd) {
    const e = readEl(b, p);
    if (!e) break;
    if (e.id === ID.Info) info = e;
    else if (e.id === ID.SeekHead || e.id === ID.Cues) positional = true;
    if (e.id === ID.Cluster) {
      p = cluster(e);
      continue;
    }
    if (e.size === null) break;
    p = e.data + e.size;
  }
  let scale = 1_000_000;
  let duration: El | null = null;
  if (info?.size != null) {
    const end = info.data + info.size;
    for (let q = info.data; q < end; ) {
      const e = readEl(b, q);
      if (!e || e.size === null) break;
      if (e.id === ID.TimecodeScale) scale = readUint(b, e.data, Math.min(8, e.size)) || scale;
      else if (e.id === ID.Duration) duration = e;
      q = e.data + e.size;
    }
  }
  return { segment, segEnd, info, scale, duration, positional, lastTicks };
}

/** WebM 裡寫的總長（毫秒；沒有寫或讀不懂＝null） */
export function readWebmDuration(bytes: Uint8Array): number | null {
  const L = parse(bytes);
  if (!L?.duration || L.duration.size === null) return null;
  const v = readFloat(bytes, L.duration.data, L.duration.size);
  return v === null ? null : (v * L.scale) / 1e6;
}

/** WebM 裡最後一格（所有軌道的區塊）的時間（毫秒；沒有區塊或讀不懂＝null） */
export function webmLastTimestampMs(bytes: Uint8Array): number | null {
  const L = parse(bytes);
  return L?.lastTicks == null ? null : (L.lastTicks * L.scale) / 1e6;
}

/** 長度欄：n 個位元組的 EBML 可變長度整數 */
function sizeBytes(v: number, n: number): number[] {
  const out: number[] = [];
  let x = v;
  for (let i = 0; i < n; i++) {
    out.unshift(x % 256);
    x = Math.floor(x / 256);
  }
  out[0] |= 0x100 >> n;
  return out;
}

/** 放得下 v 的最少位元組數（全 1 保留給「未知長度」） */
const sizeLenFor = (v: number) => {
  for (let n = 1; n <= 8; n++) if (v < 2 ** (7 * n) - 1) return n;
  return 8;
};

const float64 = (v: number) => {
  const a = new Uint8Array(8);
  new DataView(a.buffer).setFloat64(0, v);
  return [...a];
};

/**
 * 補上（或改寫）總長後的位元組；不用改或改不了＝null。只回傳要換掉的開頭部分與它在原檔的結尾，
 * 呼叫端把原檔後面的部分接回去（不複製整個檔案）。
 */
export function patchWebmDuration(
  bytes: Uint8Array,
  durationMs?: number,
): { head: Uint8Array; tailFrom: number } | null {
  const L = parse(bytes);
  if (!L?.info || L.info.size === null) return null;
  const ticks =
    durationMs !== undefined && Number.isFinite(durationMs) && durationMs > 0
      ? (durationMs * 1e6) / L.scale
      : null;
  /* 已經有 Duration：給了總長才改（照原位，長度不變） */
  if (L.duration) {
    if (ticks === null || L.duration.size === null) return null;
    const n = L.duration.size;
    if (n !== 8 && n !== 4) return null;
    const head = bytes.slice(0, L.duration.data + n);
    const dv = new DataView(head.buffer, head.byteOffset + L.duration.data, n);
    if (n === 8) dv.setFloat64(0, ticks);
    else dv.setFloat32(0, ticks);
    return { head, tailFrom: L.duration.data + n };
  }
  const value = ticks ?? L.lastTicks;
  if (value === null || !(value > 0) || L.positional) return null;
  /* 插一個 Duration（ID 44 89、長度 8、float64）在 Info 的最後 */
  const add = [0x44, 0x89, 0x88, ...float64(value)];
  const info = L.info;
  const infoEnd = info.data + (info.size ?? 0);
  const newInfoSize = (info.size ?? 0) + add.length;
  const infoSizeLen = Math.max(info.sizeLen, sizeLenFor(newInfoSize));
  const infoHead = [
    ...bytes.slice(info.start, info.sizeAt),
    ...sizeBytes(newInfoSize, infoSizeLen),
  ];
  const growth = add.length + (infoSizeLen - info.sizeLen);
  const seg = L.segment;
  let segHead = [...bytes.slice(0, seg.data)];
  if (seg.size !== null) {
    const newSeg = seg.size + growth;
    const n = Math.max(seg.sizeLen, sizeLenFor(newSeg));
    segHead = [...bytes.slice(0, seg.sizeAt), ...sizeBytes(newSeg, n)];
  }
  const head = new Uint8Array([
    ...segHead,
    ...bytes.slice(seg.data, info.start),
    ...infoHead,
    ...bytes.slice(info.data, infoEnd),
    ...add,
  ]);
  return { head, tailFrom: infoEnd };
}

/** 讀整個檔案來找最後一格的上限（再大就只用給的總長） */
const SCAN_MAX_BYTES = 512 * 1024 * 1024;

/**
 * 錄影的 WebM 補上總長（Blob 版；startCanvasRecording、recordCanvas 錄完都會呼叫）。不是 WebM、不用改、改不了＝原本的 Blob。
 * durationMs＝總長（毫秒；沒給＝最後一格的時間）。
 */
export async function withWebmDuration(
  blob: Blob,
  opts: { durationMs?: number } = {},
): Promise<Blob> {
  if (!/webm/i.test(blob.type)) return blob;
  try {
    const whole = blob.size <= SCAN_MAX_BYTES;
    const src = new Uint8Array(await (whole ? blob : blob.slice(0, 1 << 20)).arrayBuffer());
    if (!whole && opts.durationMs === undefined) return blob;
    const r = patchWebmDuration(src, opts.durationMs);
    if (!r) return blob;
    return new Blob([r.head as BlobPart, blob.slice(r.tailFrom)], { type: blob.type });
  } catch {
    return blob;
  }
}
