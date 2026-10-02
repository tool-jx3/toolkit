/**
 * 動態背景產生器的數值規則（純函式，單元測試逐條驗證）：
 * 秒數的解讀、輸出尺寸（畫質 × 比例）、載入時自動選畫質與尺寸、匯出的影格時間軸、檔名、大小的顯示。
 */
import {
  ASPECT_IDS,
  type AspectId,
  QUALITY_SIZE_TABLE,
  type QualityLevel,
  qualityOutputSize,
} from '@/core/image';
import { type SampledFrame, sampledFrames } from '@/core/timeline';
import { EFFECTS, type EffectId } from './effects';

export type SizeChoice = 'original' | AspectId;

export const MIB = 1024 * 1024;
/** 建議的檔案大小上限（5 MB＝5,242,880 位元組） */
export const SIZE_LIMIT_BYTES = 5 * MIB;
/** 載入時自動選畫質的門檻（這一批裡最大的檔案） */
export const AUTO_LIGHT_BYTES = 1 * MIB;
export const AUTO_PRESET_BYTES = 3 * MIB;
export const AUTO_MINIMUM_BYTES = 6 * MIB;

export const SECONDS_MIN = 0.5;
export const SECONDS_MAX = 12;
/** 空白或不是數字時的秒數 */
export const SECONDS_FALLBACK = 3;

/** 秒數欄的文字 → 實際秒數：夾在 0.5～12；空白或不是數字當成 3；不是 0.5 倍數的照用 */
export function parseSeconds(text: string): number {
  const v = Number.parseFloat(text);
  if (!Number.isFinite(v)) return SECONDS_FALLBACK;
  return Math.min(SECONDS_MAX, Math.max(SECONDS_MIN, v));
}

/** 秒數顯示（最多 2 位小數、去掉多餘的 0） */
export const secondsText = (s: number) => String(Math.round(s * 100) / 100);

/* ---------- 輸出尺寸 ---------- */

/** 沒有圖片時用來算尺寸的假想來源 */
const FALLBACK_SOURCE = { width: 1280, height: 720 };

/** 輸出尺寸（規格 3.2）：選比例＝表中那格；原始尺寸＝第一張圖依畫質縮小（高畫質不縮） */
export function outputSize(
  quality: QualityLevel,
  size: SizeChoice,
  first: { width: number; height: number } | null,
): { width: number; height: number } {
  return qualityOutputSize(quality, size, first ?? FALLBACK_SOURCE);
}

/* ---------- 載入時自動選畫質與尺寸（F06） ---------- */

export type AutoTier = 'standard' | 'light' | 'lightPreset' | 'minimum';

export interface AutoOutput {
  tier: AutoTier;
  quality: QualityLevel;
  size: SizeChoice;
}

/**
 * 自動挑比例：與第一張圖長寬比最接近、面積接近（以 1 MiB 像素為上限比較）、而且不放大的那一個。
 * 分數＝長寬比差 × 10 ＋ 面積差 ÷ 1,048,576 ＋（比原圖大時）5；同分取前面的。
 * 例：1240 × 900 → 4:3；1280 × 720 → 16:9。
 */
export function recommendedAspect(quality: QualityLevel, width: number, height: number): AspectId {
  const ratio = width / Math.max(1, height);
  const area = width * height;
  let best: AspectId = ASPECT_IDS[0];
  let bestScore = Infinity;
  for (const id of ASPECT_IDS) {
    const s = QUALITY_SIZE_TABLE[quality][id];
    const a = s.width * s.height;
    const score =
      Math.abs(s.width / s.height - ratio) * 10 +
      Math.abs(a - Math.min(area, MIB)) / MIB +
      (a > area ? 5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * 依「這一批裡最大的檔案大小」自動選畫質與尺寸：
 * < 1 MB → 標準、原始尺寸；≥ 1 MB → 輕量、原始尺寸；≥ 3 MB → 輕量＋自動比例；≥ 6 MB → 最小＋自動比例。
 * 自動比例照原作，用「改畫質之前」（載入時選著的畫質 before）的尺寸表打分（例：1199 × 1020、之前是標準 → 1:1；
 * 若用改成的輕量那一表打分會挑 4:3）。選單標籤與狀態列顯示的是改畫質之後的實際像素（規格第 5 節第 2 項）。
 */
export function autoOutput(
  maxBytes: number,
  first: { width: number; height: number },
  before: QualityLevel = 'standard',
): AutoOutput {
  if (maxBytes >= AUTO_MINIMUM_BYTES)
    return {
      tier: 'minimum',
      quality: 'minimum',
      size: recommendedAspect(before, first.width, first.height),
    };
  if (maxBytes >= AUTO_PRESET_BYTES)
    return {
      tier: 'lightPreset',
      quality: 'light',
      size: recommendedAspect(before, first.width, first.height),
    };
  if (maxBytes >= AUTO_LIGHT_BYTES) return { tier: 'light', quality: 'light', size: 'original' };
  return { tier: 'standard', quality: 'standard', size: 'original' };
}

/* ---------- 匯出的時間軸 ---------- */

/**
 * 匯出的影格（規格 3.3）：影格數＝秒數 × FPS 四捨五入、至少 2；延遲＝總長拆成整數毫秒、餘數給前面的格（每格至少 10 ms）。
 * 取樣：週期性的效果（E01～E06）在循環匯出時無縫（第 k 格＝k ÷ n，最後一格不重複第一格）；
 * 其他（含 E10 水波、不循環時）含頭尾（k ÷（n − 1））。
 */
export function exportFrames(
  seconds: number,
  fps: number,
  effect: EffectId | null,
  loop: boolean,
): SampledFrame[] {
  const seamless = loop && !!effect && EFFECTS[effect].periodic;
  return sampledFrames({
    duration: seconds,
    fps,
    sampling: seamless ? 'loop' : 'ends',
    delays: 'integer',
  });
}

/**
 * 連番 PNG（ZIP）的影格表：每一格存成一張，張數＝影格數（同原作：60 FPS × 1 秒＝60 張）。
 * 共用匯出依 fps 把每格的毫秒換成張數（累計四捨五入、每格至少 1 張），整數毫秒的延遲（例 17／16 ms）
 * 在 60 FPS 時會多出一張，所以這裡每格給剛好 1000 ÷ fps 毫秒；取樣時間點不變。
 */
export const pngSequenceFrames = (frames: readonly SampledFrame[], fps: number): SampledFrame[] =>
  frames.map((f) => ({ ...f, ms: 1000 / fps }));

/* ---------- 檔名（規格 3.9） ---------- */

/** 沒有圖片時的原檔名段 */
export const DEFAULT_BASE_NAME = 'bg_motion';

/** 清理：\ / : * ? " < > | 換成 _、空白換成 _、連續的 _ 合併；空的時候用預設名 */
export function cleanName(name: string, fallback = DEFAULT_BASE_NAME): string {
  const s = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  return s || fallback;
}

/** 去掉最後一個副檔名 */
export const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, '');

/** 原檔名段：一張＝檔名去掉副檔名；多張＝「第一張_and_其餘張數_more」 */
export function sourceBaseName(names: readonly string[]): string | null {
  if (!names.length) return null;
  const first = stripExtension(names[0]);
  return names.length === 1 ? first : `${first}_and_${names.length - 1}_more`;
}

/** 自動組成的檔名主體：<原檔名>_<效果名>_<濾鏡名>_<循環與否> */
export function autoFileBase(parts: {
  source: string | null;
  effect: string;
  filter: string;
  loop: string;
}): string {
  const source = cleanName(parts.source ?? DEFAULT_BASE_NAME);
  return cleanName(
    `${source}_${cleanName(parts.effect)}_${cleanName(parts.filter)}_${cleanName(parts.loop)}`,
  );
}

/** 實際使用的檔名主體：檔名欄有輸入就用它（清理後），空白時用自動名稱 */
export const effectiveFileBase = (input: string, auto: string) =>
  input.trim() ? cleanName(input, auto) : auto;

/** 主體加上後綴（_frame01、_still）：接起來後再合併連續的 _（主體結尾是被換掉的符號時不會變成兩個底線） */
export const suffixedName = (base: string, suffix: string) => cleanName(`${base}_${suffix}`);

/** 連番 PNG 每張的檔名主體（共用匯出會接上 _0001）：去掉結尾的 _，同樣不會出現兩個底線 */
export const sequenceBase = (base: string) => base.replace(/_+$/, '') || base;

/* ---------- 顯示 ---------- */

/** 檔案大小（MB，兩位小數；10 MB 以上一位） */
export function formatMb(bytes: number): string {
  const mb = bytes / MIB;
  return `${mb.toFixed(mb >= 9.95 ? 1 : 2)} MB`;
}

/** 約幾 KB（四捨五入、千分位、至少 1） */
export const approxKb = (bytes: number) =>
  Math.max(1, Math.round(bytes / 1024)).toLocaleString('en-US');
