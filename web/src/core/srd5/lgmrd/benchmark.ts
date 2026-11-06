/**
 * 簡易遭遇基準（The Lazy Encounter Benchmark；Lazy GM's 5e Monster Builder Resource Document），本站照原文的規則寫成計算。
 * 出處與授權見同資料夾的 LICENSE.txt。
 *
 * - 怪物的 CR 總和**大於**角色等級總和的 1/4（1～4 級）或 1/2（5 級以上）時，這場遭遇可能致命。結果無條件捨去
 *   （原文的例子：25 ÷ 2 = 12）。
 * - 選用的高等級調整：11～16 級用 3/4，17 級以上用等級總和本身。
 * - 單一怪物的 CR 上限：CR **大於或等於**角色的平均等級（1～4 級），或平均等級的 1.5 倍（5 級以上）時，這隻怪物可能致命。
 * - 角色的等級不同時，「幾級」看平均等級（四捨五入）。
 */

export interface BenchmarkResult {
  /** 角色人數與等級總和 */
  characters: number;
  totalLevels: number;
  /** 平均等級（四捨五入，決定用 1/4 還是 1/2） */
  avgLevel: number;
  /** 怪物的 CR 總和與最高的 CR */
  totalCr: number;
  highestCr: number;
  /** 基準：等級總和 × factor（無條件捨去） */
  factor: number;
  benchmark: number;
  /** CR 總和大於基準 */
  deadly: boolean;
  /** 選用的高等級調整（平均 11 級以上才有） */
  scaled: { factor: number; benchmark: number; deadly: boolean } | null;
  /** 單一怪物的 CR 上限（不捨去：5 級的 1.5 倍是 7.5，CR 8 才算） */
  singleCap: number;
  singleDeadly: boolean;
  /**
   * 總評：safe＝不太可能致命；deadly＝可能致命（10 級以下）；
   * deadly-low＝超過基準、沒超過選用的調整；deadly-high＝超過選用的調整或單一怪物超過上限（11 級以上）
   */
  verdict: 'safe' | 'deadly' | 'deadly-low' | 'deadly-high';
}

/**
 * levels：每名角色的等級（1～20）；crs：每隻怪物的 CR 數值（1/2 → 0.5）。沒有角色時 null。
 */
export function lazyBenchmark(
  levels: readonly number[],
  crs: readonly number[],
): BenchmarkResult | null {
  if (!levels.length) return null;
  const totalLevels = levels.reduce((a, b) => a + b, 0);
  const avgLevel = Math.round(totalLevels / levels.length);
  const totalCr = crs.reduce((a, b) => a + b, 0);
  const highestCr = crs.length ? Math.max(...crs) : 0;
  const factor = avgLevel >= 5 ? 1 / 2 : 1 / 4;
  const benchmark = Math.floor(totalLevels * factor);
  const deadly = totalCr > benchmark;
  let scaled: BenchmarkResult['scaled'] = null;
  if (avgLevel >= 11) {
    const f = avgLevel >= 17 ? 1 : 3 / 4;
    const b = Math.floor(totalLevels * f);
    scaled = { factor: f, benchmark: b, deadly: totalCr > b };
  }
  const singleCap = avgLevel >= 5 ? avgLevel * 1.5 : avgLevel;
  const singleDeadly = crs.length > 0 && highestCr >= singleCap;
  let verdict: BenchmarkResult['verdict'];
  if (scaled) {
    verdict = singleDeadly || scaled.deadly ? 'deadly-high' : deadly ? 'deadly-low' : 'safe';
  } else {
    verdict = singleDeadly || deadly ? 'deadly' : 'safe';
  }
  return {
    characters: levels.length,
    totalLevels,
    avgLevel,
    totalCr,
    highestCr,
    factor,
    benchmark,
    deadly,
    scaled,
    singleCap,
    singleDeadly,
    verdict,
  };
}

/** 介面上的說明（摘要翻譯） */
export const BENCHMARK_TEXT = {
  what: '簡易遭遇基準是可以記在腦中的粗略計算：不精確，用來感覺一場戰鬥的危險程度，看出什麼時候從「有挑戰性」變成「可能致命」。',
  rule: '怪物的挑戰等級總和大於角色等級總和的 1/4（1～4 級）或 1/2（5 級以上）時，這場遭遇可能致命。',
  deadlyMeans:
    '「致命」的意思：大部分角色可能失去一半以上的 HP、好幾名角色可能昏迷，也有角色死亡的機會。',
  scaling:
    '選用的高等級調整：角色超過 10 級後基準可能偏低。如果你的團總是覺得遭遇太弱，11～16 級改用 3/4、17 級以上改用等級總和本身。',
  single:
    '單一怪物的上限：怪物的挑戰等級大於或等於角色的平均等級（1～4 級），或平均等級的 1.5 倍（5 級以上）時，這隻怪物不論單獨或成群出現都可能致命。',
  tuning:
    '調整基準：隊伍有幫忙戰鬥的 NPC 同伴、或常把怪物移出戰鬥時，可以把人數多算一人；常在基準以下就陷入苦戰時，少算一人。',
} as const;
