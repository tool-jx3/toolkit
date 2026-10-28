/**
 * PDF 壓縮的等級與參數（純資料與純函式；主執行緒、Worker、Node 都能用）。
 *
 * 數值的來源（MIT 的兩個原作，見 docs/refactor/specs/pdf-compress.md 第 3 節的表）：
 * - QC＝mrflamingchad67/qcompress：無損（只整理結構）、balanced（JPEG 品質 78、長邊 2480 px）、
 *   maximum（品質 55、長邊 1700 px，另外也試 balanced 的設定，取小的）。QC 不看 DPI：本站只在量不到影像在頁面上的大小時
 *   才試 QC 的 balanced（`unmeasuredOnly`；量得到時 WP 的 150 DPI 幾乎都比較小，多試一次只是多花時間）。
 * - WP＝ECgear/wise-pdf：low（200 DPI、品質 82）、recommended（150 DPI、品質 72）、
 *   maximum（整頁轉成 JPEG：120 DPI、品質 60，比原檔大時把 DPI 往下降，最低 50 DPI、最多 4 次、目標 0.8 倍）；
 *   WP 不量影像在頁面上的大小，DPI 上限換算成「A4 長邊 11.7 英吋 × DPI」的長邊上限。
 *
 * 本站量得到影像在頁面上的大小時用真正的有效 DPI（`dpi.ts`），量不到時才用長邊上限。
 */

/** 壓縮等級 */
export type PdfLevel = 'lossless' | 'high' | 'balanced' | 'smallest' | 'raster';

export const PDF_LEVELS: readonly PdfLevel[] = [
  'lossless',
  'high',
  'balanced',
  'smallest',
  'raster',
];

/** WP 把 DPI 換成長邊上限時用的 A4 長邊（英吋） */
export const A4_LONG_EDGE_IN = 11.7;

/** 一組影像重新壓縮的設定 */
export interface ImageAttempt {
  /** JPEG 品質（1～100，mozjpeg） */
  quality: number;
  /** 有效解析度上限（DPI）；0＝不看 DPI，只看長邊上限 */
  dpi: number;
  /** 量不到影像在頁面上的大小時（或 dpi 為 0）的長邊上限（px）；0＝不限 */
  longEdge: number;
  /** 只用在量不到頁面大小的影像（量得到的不試） */
  unmeasuredOnly?: boolean;
}

/** 整頁轉圖的參數 */
export interface RasterParams {
  /** 起始的解析度（DPI） */
  dpi: number;
  /** JPEG 品質 */
  quality: number;
  /** 比原檔大時往下降，最低到這個 DPI */
  minDpi: number;
  /** 往下降時以「原檔大小 × ratio」為目標 */
  ratio: number;
  /** 最多畫幾輪（含第一輪） */
  passes: number;
}

export interface LevelSpec {
  /** 會不會改變影像（失真）；無損的等級不會 */
  lossy: boolean;
  /**
   * 影像的設定，依序都試、每張圖取最小的（空的＝不動影像）。
   * 第一組是這個等級本身的設定，後面的都比它輕（品質更高或解析度更高），所以結果的品質不會低於第一組。
   * 「最小」包含「平衡」的全部設定，所以每張圖的結果都不會比平衡大。
   */
  images: readonly ImageAttempt[];
  /** 整頁轉圖（null＝不轉） */
  raster: RasterParams | null;
}

const wpLongEdge = (dpi: number) => Math.round(dpi * A4_LONG_EDGE_IN);

/** QC 的 balanced（長邊 2480 px、品質 78；QC 不看 DPI，所以只用在量不到大小的影像） */
const QC_BALANCED: ImageAttempt = { quality: 78, dpi: 0, longEdge: 2480, unmeasuredOnly: true };
/** WP 的 recommended（150 DPI、品質 72） */
const WP_RECOMMENDED: ImageAttempt = { quality: 72, dpi: 150, longEdge: wpLongEdge(150) };

export const LEVELS: Readonly<Record<PdfLevel, LevelSpec>> = {
  /* QC 的 lossless：只整理結構、移除重複，不動影像 */
  lossless: { lossy: false, images: [], raster: null },
  /* WP 的 low */
  high: {
    lossy: true,
    images: [{ quality: 82, dpi: 200, longEdge: wpLongEdge(200) }],
    raster: null,
  },
  /* WP 的 recommended，另外試 QC 的 balanced（量不到大小的影像） */
  balanced: { lossy: true, images: [WP_RECOMMENDED, QC_BALANCED], raster: null },
  /*
   * QC 的 maximum（品質 55、長邊 1700 px），另外試平衡的全部設定（QC：maximum 也試 balanced），每張圖都不會比平衡大。
   * DPI 上限 120 是本站加的（取 WP 最強一級的 120 DPI）：量得到大小時，最小不能比平衡（150 DPI）留更多像素。
   */
  smallest: {
    lossy: true,
    images: [{ quality: 55, dpi: 120, longEdge: 1700 }, WP_RECOMMENDED, QC_BALANCED],
    raster: null,
  },
  /* WP 的 maximum */
  raster: {
    lossy: true,
    images: [],
    raster: { dpi: 120, quality: 60, minDpi: 50, ratio: 0.8, passes: 4 },
  },
};

export const DEFAULT_LEVEL: PdfLevel = 'balanced';

/** 進階設定（本站自訂；null＝照等級） */
export interface PdfAdvanced {
  /** JPEG 品質（30～95） */
  quality: number | null;
  /** 有效解析度上限（72～600 DPI）；整頁轉圖時是起始的解析度 */
  dpi: number | null;
  /** 把沒壓縮或 Flate 壓縮的大張照片類影像轉成 JPEG（D 項；有透明遮罩、看起來是圖表的不轉） */
  convertFlate: boolean;
  /** 壓縮後用 pdf.js 比對頁數、文字、連結、書籤與表單欄位，不一樣就不用這個結果 */
  verify: boolean;
}

export const DEFAULT_ADVANCED: PdfAdvanced = {
  quality: null,
  dpi: null,
  convertFlate: true,
  verify: true,
};

export const QUALITY_RANGE = { min: 30, max: 95 } as const;
export const DPI_RANGE = { min: 72, max: 600 } as const;

/** 傳給引擎的設定（等級＋進階設定合起來） */
export interface ResolvedSettings {
  level: PdfLevel;
  lossy: boolean;
  images: readonly ImageAttempt[];
  raster: RasterParams | null;
  convertFlate: boolean;
  verify: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * 等級＋進階設定 → 引擎的設定。
 * 進階設定改了品質或 DPI 時只試那一組（不再試比較輕的設定）；只改 DPI 時長邊上限照 WP 的換算（DPI × 11.7）。
 */
export function resolveSettings(
  level: PdfLevel,
  advanced: Partial<PdfAdvanced> = {},
): ResolvedSettings {
  const spec = LEVELS[level] ?? LEVELS[DEFAULT_LEVEL];
  const adv = { ...DEFAULT_ADVANCED, ...advanced };
  const quality =
    adv.quality == null ? null : clamp(adv.quality, QUALITY_RANGE.min, QUALITY_RANGE.max);
  const dpi = adv.dpi == null ? null : clamp(adv.dpi, DPI_RANGE.min, DPI_RANGE.max);
  let images = spec.images;
  if (images.length && (quality !== null || dpi !== null)) {
    const base = images[0];
    const d = dpi ?? base.dpi;
    images = [
      {
        quality: quality ?? base.quality,
        dpi: d,
        longEdge: dpi === null ? base.longEdge : wpLongEdge(d),
      },
    ];
  }
  let raster = spec.raster;
  if (raster && (quality !== null || dpi !== null)) {
    raster = {
      ...raster,
      quality: quality ?? raster.quality,
      dpi: dpi ?? raster.dpi,
      minDpi: Math.min(raster.minDpi, dpi ?? raster.dpi),
    };
  }
  return {
    level,
    lossy: spec.lossy,
    images,
    raster,
    convertFlate: spec.lossy && !raster && adv.convertFlate,
    verify: adv.verify,
  };
}
