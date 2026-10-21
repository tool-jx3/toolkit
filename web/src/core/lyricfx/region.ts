/**
 * 避開區域（lyric-fx 規格 2、3.8）：工具層的共用設定（畫面的比例，0～1），由工具在預覽上框選、
 * 透過 plan 的 options.region 交給風格（風格的設定裡沒有它）。
 */
import type { LyricRegion } from './types';

/** 最小的寬高（畫面的比例；規格 F54：寬高都超過 0.3% 才算） */
export const REGION_MIN_SIZE = 0.003;

/** 讀存檔、專案檔時修正：夾在畫面裡，寬或高不到 0.3% 時當成沒有（null） */
export function normalizeRegion(v: unknown): LyricRegion | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number.NaN);
  let x = n(o.x);
  let y = n(o.y);
  let w = n(o.width);
  let h = n(o.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  x = Math.min(1, Math.max(0, x));
  y = Math.min(1, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0, w));
  h = Math.min(1 - y, Math.max(0, h));
  if (w < REGION_MIN_SIZE || h < REGION_MIN_SIZE) return null;
  return { x, y, width: w, height: h };
}
