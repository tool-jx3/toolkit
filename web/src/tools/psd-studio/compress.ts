/**
 * 容量壓縮的搜尋（psd-studio 規格 3.6、3.7、F81、F97～F99；第 7 節裁定：已在目標內就不動、搜尋順序新版自訂）。純函式：
 * 實際的縮小與編碼由呼叫端給（attempt），這裡只決定要試哪些組合、用哪一個。
 *
 * 順序：
 * 0. 無損（調色後原尺寸、全彩或色數本來就在 256 以內的調色盤）不超過目標 → 用它（第 7 節裁定：不再一律減到 256 色）。
 * 1. 尺寸 100% → 90% → … → 40%：每一種尺寸先試最少的色數（32）；連 32 色都超過就換下一個尺寸，
 *    放得下時在這個尺寸裡二分搜尋「放得下的最多色數」（256、192、128、96、64、48、32）。
 *    結果與舊版「依序一個一個試、第一個放得下的就用」相同（同一尺寸裡色數越少檔案越小），但試的次數少很多。
 * 2. 都不行而且允許跳格（APNG、至少 6 格）：只留第 1、3、5…格（每格延遲＝自己＋下一格），
 *    尺寸 90%、75%、60%、50% × 色數 128、64、32，同樣的找法。
 * 3. 還是不行：尺寸 40%、32 色、全部格數，標記「仍超過目標」（第 5 節第 20 項：呼叫端要提醒）。
 */

export const SCALE_STEPS: readonly number[] = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
export const COLOR_STEPS: readonly number[] = [256, 192, 128, 96, 64, 48, 32];
export const SKIP_SCALE_STEPS: readonly number[] = [0.9, 0.75, 0.6, 0.5];
export const SKIP_COLOR_STEPS: readonly number[] = [128, 64, 32];
/** 跳格的門檻：至少幾格才跳（規格：格數不是太少；門檻由新版決定） */
export const SKIP_MIN_FRAMES = 6;

/** 1 MB＝1,048,576 位元組（F85） */
export const MB = 1024 * 1024;
export const TARGET_CHOICES: readonly number[] = [4.8, 2, 10];
export const targetBytes = (mb: number): number => mb * MB;

/** 一次嘗試：尺寸比例、色數（null＝無損）、是否跳格 */
export interface Attempt {
  scale: number;
  colors: number | null;
  skip: boolean;
}

export interface SearchResult {
  attempt: Attempt;
  size: number;
  /** 連最低設定都超過目標 */
  over: boolean;
  /** 依序試過的組合（測試、狀態文字用） */
  tried: Attempt[];
}

export interface SearchOptions {
  target: number;
  /** 影格數（靜態圖 1） */
  frames: number;
  /** 允許跳格（F86） */
  allowSkip: boolean;
  /** 編一次、回傳大小（同一組合只會呼叫一次） */
  attempt: (a: Attempt) => Promise<number>;
  /** 要試某一組之前（狀態文字） */
  onTry?: (a: Attempt) => void;
  /** 開始跳格之前（狀態文字「正在計算跳格」） */
  onSkip?: () => void;
}

const keyOf = (a: Attempt) => `${a.scale}|${a.colors ?? 'x'}|${a.skip ? 1 : 0}`;

/** 照上面的順序找出要用的組合 */
export async function searchCompression(o: SearchOptions): Promise<SearchResult> {
  const sizes = new Map<string, number>();
  const tried: Attempt[] = [];
  const measure = async (a: Attempt) => {
    const k = keyOf(a);
    const known = sizes.get(k);
    if (known !== undefined) return known;
    o.onTry?.(a);
    tried.push(a);
    const size = await o.attempt(a);
    sizes.set(k, size);
    return size;
  };
  const fits = async (a: Attempt) => (await measure(a)) <= o.target;

  const lossless: Attempt = { scale: 1, colors: null, skip: false };
  if (await fits(lossless))
    return { attempt: lossless, size: sizes.get(keyOf(lossless))!, over: false, tried };

  /** 在一個尺寸裡找放得下的最多色數（colors 由多到少）；連最少的都放不下時 null */
  const within = async (scale: number, colors: readonly number[], skip: boolean) => {
    const at = (i: number): Attempt => ({ scale, colors: colors[i], skip });
    let hi = colors.length - 1;
    if (!(await fits(at(hi)))) return null;
    let lo = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (await fits(at(mid))) hi = mid;
      else lo = mid + 1;
    }
    return at(hi);
  };

  for (const scale of SCALE_STEPS) {
    const a = await within(scale, COLOR_STEPS, false);
    if (a) return { attempt: a, size: sizes.get(keyOf(a))!, over: false, tried };
  }
  if (o.allowSkip && o.frames >= SKIP_MIN_FRAMES) {
    o.onSkip?.();
    for (const scale of SKIP_SCALE_STEPS) {
      const a = await within(scale, SKIP_COLOR_STEPS, true);
      if (a) return { attempt: a, size: sizes.get(keyOf(a))!, over: false, tried };
    }
  }
  const last: Attempt = {
    scale: SCALE_STEPS[SCALE_STEPS.length - 1],
    colors: COLOR_STEPS[COLOR_STEPS.length - 1],
    skip: false,
  };
  const size = await measure(last);
  return { attempt: last, size, over: size > o.target, tried };
}

/** 跳格：只留第 1、3、5…格，每格延遲＝自己＋下一格（最後落單的一格延遲加倍） */
export function skipFrames<T>(frames: readonly T[], delays: readonly number[]) {
  const outFrames: T[] = [];
  const outDelays: number[] = [];
  for (let i = 0; i < frames.length; i += 2) {
    outFrames.push(frames[i]);
    const d1 = delays[i] ?? 0;
    const d2 = i + 1 < delays.length ? delays[i + 1] : d1;
    outDelays.push(d1 + d2);
  }
  return { frames: outFrames, delays: outDelays };
}

/** 縮小後的尺寸（至少 1 px） */
export const scaledSize = (w: number, h: number, scale: number) => ({
  width: Math.max(1, Math.round(w * scale)),
  height: Math.max(1, Math.round(h * scale)),
});

/** 節省比例（%，一位小數，最少 0；F81） */
export const savingPercent = (orig: number, out: number): string =>
  Math.max(0, (1 - out / (orig || out || 1)) * 100).toFixed(1);

/** MB，兩位小數（F81） */
export const formatMb = (bytes: number): string => `${(bytes / MB).toFixed(2)} MB`;
