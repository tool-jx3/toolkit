/**
 * 容量壓縮的搜尋（psd-studio 規格 3.6、3.7、F81、F97～F99；第 7 節裁定：已在目標內就不動、搜尋順序新版自訂）。純函式：
 * 實際的縮小與編碼由呼叫端給（attempt），這裡只決定要試哪些組合、用哪一個。
 *
 * 結果與舊版「依序一個一個試、第一個放得下的就用」相同（同一尺寸裡色數越少檔案越小）：
 * 0. 無損（調色後原尺寸、全彩或色數本來就在 256 以內的調色盤）不超過目標 → 用它（第 7 節裁定：不再一律減到 256 色）。
 * 1. 尺寸 100% → 90% → … → 40%（舊版的順序）：每一種尺寸找「放得下的最多色數」（256、192、128、96、64、48、32）。
 * 2. 都不行而且允許跳格（APNG、至少 6 格）：只留第 1、3、5…格（每格延遲＝自己＋下一格），
 *    尺寸 90%、75%、60%、50% × 色數 128、64、32，同樣的找法。
 * 3. 還是不行：尺寸 40%、32 色、全部格數，標記「仍超過目標」（第 5 節第 20 項：呼叫端要提醒）。
 *
 * 少編幾次的方法（每次編碼都很花時間）：用已經編過的大小預估其他組合的大小
 * （調色盤 PNG 大致與「像素數 × log2(色數)」成正比）：
 * - 還沒有減色過（只知道無損的大小）：照舊版先試 256 色（中小型檔通常一次就好）；
 *   但預估連 32 色都放不下時先試 32 色，放不下就換下一個尺寸（大檔不必在每個尺寸試 7 種色數）。
 * - 有減色的大小可以參考之後：先試「預估放得下的最多色數」，都預估放不下就試 32 色（這個尺寸行不行）；
 *   放得下之後，再試「多一級色數」確認放不下，邊界就確定了。
 * 預估只影響試的順序，不影響結果。超過目標的組合呼叫端可以提早放棄（attempt 的 limit），回傳估計的大小。
 */

export const SCALE_STEPS: readonly number[] = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
export const COLOR_STEPS: readonly number[] = [256, 192, 128, 96, 64, 48, 32];
export const SKIP_SCALE_STEPS: readonly number[] = [0.9, 0.75, 0.6, 0.5];
export const SKIP_COLOR_STEPS: readonly number[] = [128, 64, 32];
/** 跳格的門檻：至少幾格才跳（規格：格數不是太少；門檻由新版決定） */
export const SKIP_MIN_FRAMES = 6;
/**
 * 還沒有減色的大小可以參考時，用無損的大小預估 256 色的大小：256 色 ≈ 無損 × 這個比例
 * （雜訊約 0.3、照片與插圖約 0.4～0.5）。只用來決定第一次先試 256 色還是 32 色。
 */
export const PALETTE_PER_LOSSLESS = 0.4;

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
  /**
   * 編一次、回傳大小（同一組合只會呼叫一次，除了最後的保底組合見下）。
   * 編到一半已經超過 limit 時可以放棄，回傳估計的整個檔案大小（必須大於 limit）；
   * limit 為 Infinity 時一定要編完（保底組合：之前放棄過的會用 Infinity 再編一次）。
   */
  attempt: (a: Attempt, limit: number) => Promise<number>;
  /** 要試某一組之前（狀態文字） */
  onTry?: (a: Attempt) => void;
  /** 開始跳格之前（狀態文字「正在計算跳格」） */
  onSkip?: () => void;
}

const keyOf = (a: Attempt) => `${a.scale}|${a.colors ?? 'x'}|${a.skip ? 1 : 0}`;
const bits = (colors: number) => Math.log2(colors);

interface Known {
  scale: number;
  colors: number;
  skip: boolean;
  size: number;
}

/** 照上面的順序找出要用的組合 */
export async function searchCompression(o: SearchOptions): Promise<SearchResult> {
  const sizes = new Map<string, number>();
  const tried: Attempt[] = [];
  /** 減色過的組合與大小（預估用；提早放棄的是估計值） */
  const known: Known[] = [];
  let lossless = 0;
  const measure = async (a: Attempt, limit = o.target) => {
    const k = keyOf(a);
    const done = sizes.get(k);
    if (done !== undefined && (done <= o.target || limit !== Number.POSITIVE_INFINITY)) return done;
    o.onTry?.(a);
    if (done === undefined) tried.push(a);
    const size = await o.attempt(a, limit);
    sizes.set(k, size);
    if (a.colors === null) lossless = size;
    else if (done === undefined)
      known.push({ scale: a.scale, colors: a.colors, skip: a.skip, size });
    return size;
  };
  const fits = async (a: Attempt) => (await measure(a)) <= o.target;

  const lossAttempt: Attempt = { scale: 1, colors: null, skip: false };
  if (await fits(lossAttempt))
    return { attempt: lossAttempt, size: sizes.get(keyOf(lossAttempt))!, over: false, tried };

  /** 跳格後的格數比例 */
  const skipRatio = o.frames > 0 ? Math.ceil(o.frames / 2) / o.frames : 1;
  /** 預估某個組合的大小 */
  const predict = (scale: number, colors: number, skip: boolean): number => {
    /* 同一個尺寸有編過：夾在兩個色數之間就內插（log2），否則依 log2 比例 */
    let lo: Known | undefined;
    let hi: Known | undefined;
    for (const k of known) {
      if (k.scale !== scale || k.skip !== skip) continue;
      if (k.colors <= colors && (!lo || k.colors > lo.colors)) lo = k;
      if (k.colors >= colors && (!hi || k.colors < hi.colors)) hi = k;
    }
    if (lo && hi) {
      if (lo.colors === hi.colors) return lo.size;
      const t = (bits(colors) - bits(lo.colors)) / (bits(hi.colors) - bits(lo.colors));
      return lo.size + (hi.size - lo.size) * t;
    }
    const near = lo ?? hi;
    if (near) return (near.size * bits(colors)) / bits(near.colors);
    /* 別的尺寸：最接近的尺寸（同樣跳不跳格優先），依面積與 log2 比例 */
    let ref: Known | undefined;
    for (const k of known) {
      if (!ref) {
        ref = k;
        continue;
      }
      const better =
        (k.skip === skip) !== (ref.skip === skip)
          ? k.skip === skip
          : Math.abs(k.scale - scale) !== Math.abs(ref.scale - scale)
            ? Math.abs(k.scale - scale) < Math.abs(ref.scale - scale)
            : Math.abs(bits(k.colors) - bits(colors)) < Math.abs(bits(ref.colors) - bits(colors));
      if (better) ref = k;
    }
    const frameRatio = (s: boolean) => (s ? skipRatio : 1);
    if (ref)
      return (
        ((ref.size * (scale / ref.scale) ** 2 * bits(colors)) / bits(ref.colors)) *
        (frameRatio(skip) / frameRatio(ref.skip))
      );
    return lossless * PALETTE_PER_LOSSLESS * scale ** 2 * (bits(colors) / 8) * frameRatio(skip);
  };

  /** 在一個尺寸裡找放得下的最多色數（colors 由多到少）；連最少的都放不下時 null */
  const within = async (scale: number, colors: readonly number[], skip: boolean) => {
    const n = colors.length;
    const at = (i: number): Attempt => ({ scale, colors: colors[i], skip });
    /** 已知放得下的最小索引（色數最多）；n＝還沒有 */
    let fit = n;
    /** 已知放不下的最大索引；−1＝還沒有 */
    let fail = -1;
    /** (from..to) 裡預估放得下的最多色數；都放不下時 −1 */
    const guess = (from: number, to: number) => {
      /* 還沒有減色過：只要預估最少色數放得下，就照舊版從最多色數開始 */
      if (!known.length) return predict(scale, colors[to], skip) <= o.target ? from : -1;
      for (let i = from; i <= to; i++) if (predict(scale, colors[i], skip) <= o.target) return i;
      return -1;
    };
    while (fit !== fail + 1) {
      const g = guess(fail + 1, Math.min(fit, n) - 1);
      /* 沒有預估放得下的：還沒有放得下的就試最少色數（這個尺寸行不行），否則試多一級確認邊界 */
      const p = g >= 0 ? g : fit === n ? n - 1 : fit - 1;
      if (await fits(at(p))) fit = p;
      else fail = p;
    }
    return fit < n ? at(fit) : null;
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
  const size = await measure(last, Number.POSITIVE_INFINITY);
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
