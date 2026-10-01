/**
 * 逐格渲染介面：工具把動畫寫成一個 AnimationSource，預覽（Stage＋Transport）與匯出（exportAnimation）共用。
 */
import type { FrameSpec } from './frames';
import type { TimelineSegment } from './timeline';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface AnimationSource {
  /** 原始尺寸（px）；匯出時可再乘上縮放比例 */
  width: number;
  height: number;
  /** 總長（秒） */
  duration: number;
  /**
   * 畫出 t 秒時的畫面。呼叫前畫布已清空（透明），並已套用縮放，
   * 所以一律用原始尺寸的座標畫。同樣的 t 必須畫出完全相同的畫面（亂數請用 core/timeline 的決定性亂數）。
   */
  render(ctx: Ctx2D, t: number): void | Promise<void>;
  /** 匯出前呼叫一次（例如等字型、圖片載入） */
  prepare?(): Promise<void>;
  /** 無縫循環的動畫設 true：匯出時最後一格不取在結尾，避免和第一格重複 */
  loop?: boolean;
  /** 代表畫面的時間（單張 PNG、APNG 預設圖用），預設為結尾 */
  stillTime?: number;
  /** 階段（給 Transport 標色） */
  segments?: TimelineSegment[];
  /**
   * 影格表：每格各自的長度（毫秒）。給了就照表匯出（第 i 格 render 的時間＝FrameSpec.t 或這格開始的時間），
   * fps 不影響影格與延遲；duration 應等於 frameTableDuration(frames)。預覽用 frameIndexAt 找目前的格。
   */
  frames?: readonly FrameSpec[];
}
