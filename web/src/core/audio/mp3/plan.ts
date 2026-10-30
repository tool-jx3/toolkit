/**
 * 循環用 MP3 的編法（純函式，算數字用；真正的編碼在 `encode.ts`，只有它載入 lamejs）。
 *
 * MP3 解碼出來的聲音會比送進編碼器的晚 1105 個取樣（LAME 的編碼器延遲 576 ＋ 解碼器的延遲 529），
 * 結尾也會補到整個影格。直接把一段循環編成 MP3，循環播放時接縫會有 30～50 ms 的靜音。所以：
 * 1. **先多編一段再裁**：送進編碼器的是「循環的最後一段（預捲）＋整段循環＋循環的開頭（接續）」，
 *    再把開頭的兩個影格丟掉、結尾只留到需要的影格（MP3 的位元儲備關掉了，每個影格都能單獨解碼）；
 * 2. **LAME 的 Info 標頭**寫上裁掉的長度（編碼器延遲＝開頭要裁的、填充＝結尾要裁的）：看得懂的解碼器
 *    （FFmpeg 系；實測 Chromium 的 decodeAudioData 與 `<audio>`）裁掉之後剛好是一整段循環，首尾相接；
 * 3. **看不懂標頭的播放器**：開頭是解碼器剛起步的一小段（約 1100 個取樣，聲音從小慢慢變大），
 *    結尾是接續的那一段再淡出——接縫是一個很短的音量凹陷（不會「喀」一聲，但聽得出來）。
 */

/** 每個影格的取樣數（取樣率 32 kHz 以上是 MPEG-1，以下是 MPEG-2／2.5） */
export const mp3FrameSamples = (sampleRate: number): number => (sampleRate >= 32000 ? 1152 : 576);

/** 編碼失敗（訊息可以直接顯示） */
export class Mp3EncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mp3EncodeError';
  }
}

/** LAME 的編碼器延遲（取樣數；送進去的第 i 個取樣在完整的解碼結果裡是第 i ＋ 1105 個） */
export const LAME_ENCODER_DELAY = 576;
/** 解碼器的延遲（528 ＋ 1；FFmpeg、LAME 的解碼器都照這個數字裁） */
export const MP3_DECODER_DELAY = 529;
/** 編碼器延遲＋解碼器延遲 */
export const MP3_TOTAL_DELAY = LAME_ENCODER_DELAY + MP3_DECODER_DELAY;

export interface Mp3LoopPlan {
  /** 每個影格的取樣數 */
  spf: number;
  /** 循環的長度（取樣數） */
  n: number;
  /** 送進編碼器的預捲（循環的最後 preroll 個取樣，放在循環前面） */
  preroll: number;
  /** 編好之後開頭丟掉幾個影格 */
  drop: number;
  /** 留下幾個聲音影格 */
  frames: number;
  /** 寫進 Info 標頭的編碼器延遲（＝留下的影格解碼後要先裁掉 delay ＋ 529 個取樣） */
  delay: number;
  /** 寫進 Info 標頭的填充（結尾要裁掉的取樣數） */
  padding: number;
  /** 預捲開頭的淡入（取樣數；不丟影格時才需要，丟影格時 0） */
  fadeIn: number;
  /** 最後一個影格結尾的淡出（取樣數） */
  fadeOut: number;
  /** 送進編碼器的取樣數（預捲＋循環＋接續；之後是靜音） */
  fed: number;
}

export interface Mp3LoopPlanOptions {
  /**
   * 開頭丟掉幾個影格（預設 2）。丟影格：看不懂標頭的播放器聽到的是「慢慢變大」而不是一整段靜音。
   * 只丟 1 個時，留下的第一個影格離送進去的開頭（LAME 的靜音之後突然開始）太近，循環最前面 256 個取樣的誤差
   * 比中間大（22.05 kHz 最明顯，最差 −13 dB）；丟 2 個就和中間一樣（驗證後修正，2026-10-29）。
   */
  drop?: number;
  /** 淡出（與不丟影格時的淡入）的秒數（預設 0.004） */
  fade?: number;
  /** 淡化和循環本體之間留的距離（取樣數，預設 576：一個 granule） */
  margin?: number;
}

/**
 * 一段 n 個取樣的循環要怎麼編（看 Mp3LoopPlan 的說明）。延遲與填充都在 Info 標頭的範圍（0～4095）內。
 */
export function mp3LoopPlan(
  n: number,
  sampleRate: number,
  { drop = 2, fade = 0.004, margin = 576 }: Mp3LoopPlanOptions = {},
): Mp3LoopPlan {
  const spf = mp3FrameSamples(sampleRate);
  const f = Math.max(1, Math.round(fade * sampleRate));
  const d = Math.max(0, Math.floor(drop));
  /* 不丟影格：開頭是 LAME 的靜音，預捲要淡入；丟影格：解碼器的起步（約 1100 個取樣）要落在裁掉的範圍裡 */
  const fadeIn = d === 0 ? f : 0;
  const preroll = d === 0 ? fadeIn + margin : d * spf;
  const delay = LAME_ENCODER_DELAY + preroll - d * spf;
  /* 結尾：循環本體之後至少 529（解碼器的延遲）＋淡出＋距離 */
  const minEnd = delay + n + MP3_DECODER_DELAY + f + margin;
  const frames = Math.ceil(minEnd / spf);
  const padding = frames * spf - delay - n;
  const fed = (d + frames) * spf - MP3_TOTAL_DELAY;
  return { spf, n, preroll, drop: d, frames, delay, padding, fadeIn, fadeOut: f, fed };
}

/** MPEG-1（32 kHz 以上）的影格位元組數係數；MPEG-2 是一半 */
const frameCoef = (sampleRate: number) => (sampleRate >= 32000 ? 144000 : 72000);

/**
 * 循環用 MP3 的大小（位元組，估計到幾個位元組以內）：Info 標頭影格＋聲音影格（CBR，填充位元平均分配）。
 */
export function mp3LoopBytes(seconds: number, sampleRate: number, kbps: number): number {
  const plan = mp3LoopPlan(Math.round(seconds * sampleRate), sampleRate);
  const per = (frameCoef(sampleRate) * kbps) / sampleRate;
  return Math.floor(per) + Math.round(plan.frames * per);
}
