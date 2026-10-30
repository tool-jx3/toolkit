/**
 * 把一段首尾相接的循環編成 MP3（CBR）：lamejs（LAME 3.98.4 的 JavaScript 移植，LGPL-3.0）編碼，
 * 依 `plan.ts` 先多編一段再裁、寫上 LAME 的 Info 標頭（編碼器延遲與填充）。
 *
 * **lamejs 用動態 import 載入**（自己一個 chunk，按下匯出 MP3 才下載；LGPL 的函式庫也因此是獨立的檔案）：
 * 平常在 Worker（`mp3.worker.ts`）裡跑，Worker 不能用時主執行緒的備案（`client.ts`）也是動態載入這個檔案。
 */
import type { PcmAudio } from '../pcm';
import { crc16, listMp3Frames, mp3Bitrates, mp3InfoFrame } from './frames';
import { Mp3EncodeError, type Mp3LoopPlanOptions, mp3LoopPlan } from './plan';

export interface Mp3EncodeOptions {
  /** 位元率（kbps，CBR；要是這個取樣率可以用的） */
  kbps: number;
  /** 編法的細節（測試、量測用；平常不給） */
  plan?: Mp3LoopPlanOptions;
}

export interface Mp3EncodeHooks {
  /** 進度（0～1） */
  onProgress?: (fraction: number) => void;
  /** 每編一段讓出一下（主執行緒的備案用，讓畫面更新）；回傳 false 時停下來（取消） */
  pause?: () => Promise<boolean> | boolean;
}

/** 一次送進編碼器的取樣數（影格的整數倍） */
const CHUNK = 1152 * 24;

const toInt16 = (s: number) =>
  s <= -1 ? -32768 : s >= 1 ? 32767 : Math.round(s < 0 ? s * 32768 : s * 32767);

/**
 * 首尾相接的循環（單聲道或立體聲）→ 可以無縫循環的 MP3 檔（Info 標頭影格＋聲音影格）。
 * 看得懂 Info 標頭的解碼器解出來剛好是 pcm 的長度、第 0 個取樣就是 pcm 的第 0 個（首尾相接）。
 */
export async function encodeMp3Loop(
  pcm: PcmAudio,
  o: Mp3EncodeOptions,
  hooks: Mp3EncodeHooks = {},
): Promise<Uint8Array> {
  const rate = pcm.sampleRate;
  const channels = pcm.channels.length === 1 ? 1 : 2;
  const n = pcm.channels[0]?.length ?? 0;
  if (!n) throw new Mp3EncodeError('沒有聲音可以編碼。');
  if (!mp3Bitrates(rate).includes(o.kbps))
    throw new Mp3EncodeError(`MP3 不能用 ${rate} Hz、${o.kbps} kbps。`);
  const plan = mp3LoopPlan(n, rate, o.plan);
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const enc = new Mp3Encoder(channels, rate, o.kbps);
  const src = pcm.channels.slice(0, channels);
  const bufs = Array.from({ length: channels }, () => new Int16Array(CHUNK));
  const parts: Uint8Array[] = [];
  /* 送進去的：預捲＋循環＋接續（plan.fed 個），開頭淡入、結尾淡出，之後一個影格的靜音讓編碼器把最後的影格編完 */
  const total = plan.fed + plan.spf;
  const fadeOutFrom = plan.fed - plan.fadeOut;
  for (let s = 0; s < total; s += CHUNK) {
    const len = Math.min(CHUNK, total - s);
    for (let c = 0; c < channels; c++) {
      const ch = src[c];
      const out = bufs[c];
      for (let k = 0; k < len; k++) {
        const i = s + k;
        if (i >= plan.fed) {
          out[k] = 0;
          continue;
        }
        let g = 1;
        if (i < plan.fadeIn) g = 0.5 - 0.5 * Math.cos((Math.PI * (i + 0.5)) / plan.fadeIn);
        else if (i >= fadeOutFrom)
          g = 0.5 + 0.5 * Math.cos((Math.PI * (i - fadeOutFrom + 0.5)) / plan.fadeOut);
        const j = (((i - plan.preroll) % n) + n) % n;
        out[k] = toInt16(ch[j] * g);
      }
    }
    const left = bufs[0].subarray(0, len);
    const chunk =
      channels === 2 ? enc.encodeBuffer(left, bufs[1].subarray(0, len)) : enc.encodeBuffer(left);
    if (chunk.length)
      parts.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length).slice());
    hooks.onProgress?.(Math.min(1, (s + len) / total) * 0.98);
    if (hooks.pause && (await hooks.pause()) === false)
      throw new DOMException('已取消', 'AbortError');
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.length).slice());
  let size = 0;
  for (const p of parts) size += p.length;
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const frames = listMp3Frames(all);
  /* LAME 在位元率太低時會自己降取樣率（例如 44.1 kHz 立體聲低於 112 kbps）：影格的長度就不對了 */
  const got = frames[0]?.header;
  if (got && (got.sampleRate !== rate || got.bitrate !== o.kbps))
    throw new Mp3EncodeError(`編碼器把取樣率換成了 ${got.sampleRate} Hz、${got.bitrate} kbps。`);
  if (frames.length < plan.drop + plan.frames)
    throw new Mp3EncodeError('編碼器輸出的影格不夠，請再試一次。');
  const first = frames[plan.drop];
  const last = frames[plan.drop + plan.frames - 1];
  const audio = all.subarray(first.offset, last.offset + last.header.length);
  const info = mp3InfoFrame({
    firstHeader: all.subarray(first.offset, first.offset + 4),
    frames: plan.frames,
    audioBytes: audio.length,
    delay: plan.delay,
    padding: plan.padding,
    bitrate: o.kbps,
    musicCrc: crc16(audio),
  });
  const file = new Uint8Array(info.length + audio.length);
  file.set(info, 0);
  file.set(audio, info.length);
  hooks.onProgress?.(1);
  return file;
}
