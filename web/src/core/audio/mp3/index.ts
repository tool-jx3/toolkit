/**
 * core/audio/mp3：把一段首尾相接的循環編成可以無縫循環的 MP3（ambience-mixer 加 MP3 匯出時新增）。
 *
 * - 編碼（`client.ts`）：`encodeMp3(pcm, { kbps }, { signal?, onProgress? })` → MP3 的位元組。Worker 裡用 lamejs
 *   （LGPL-3.0，動態載入、自己一個 chunk）編 CBR，先多編一段再裁、寫上 LAME 的 Info 標頭（編碼器延遲與填充）。
 * - 編法與大小（`plan.ts`，純函式）：`mp3LoopPlan(n, rate)`、`mp3LoopBytes(seconds, rate, kbps)`、延遲的常數。
 * - 影格（`frames.ts`，純函式）：`readMp3Header`、`listMp3Frames`、`mp3InfoFrame`、`readMp3InfoTag`、`crc16`、
 *   `mp3Bitrates(rate)`、`mp3FrameSamples(rate)`。
 *
 * **不要從 `@/core/audio` 匯出**：用到的工具才 import 這裡（其他工具的程式不會多出編碼的部分）。
 */
export { encodeMp3, type Mp3EncodeRun } from './client';
export type { Mp3EncodeOptions } from './encode';
export {
  crc16,
  listMp3Frames,
  type Mp3Frame,
  type Mp3FrameHeader,
  type MpegVersion,
  mp3Bitrates,
  mp3FrameSamples,
  mp3InfoFrame,
  readMp3Header,
  readMp3InfoTag,
} from './frames';
export {
  LAME_ENCODER_DELAY,
  MP3_DECODER_DELAY,
  MP3_TOTAL_DELAY,
  Mp3EncodeError,
  type Mp3LoopPlan,
  type Mp3LoopPlanOptions,
  mp3LoopBytes,
  mp3LoopPlan,
} from './plan';
