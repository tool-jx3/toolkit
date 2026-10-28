/**
 * 新增角色、換立繪、調整頭像、從立繪補取色的流程（AddFlow 照這裡的工作一步一步做）；
 * 編輯中的角色（CharacterDialog）。都只在這次開頁有效，不存、不列入復原。
 */
import { create } from 'zustand';
import type { FramePlacement } from '@/core/image';
import { drawPlacedCrop, makeCanvas } from '@/core/image';
import { dominantInCircle, type KeyRole } from './characters';

export type FlowJob =
  /** 新增角色：一張一張圈頭像、取色 */
  | { kind: 'add'; files: File[] }
  /** 換某位角色的立繪：圈頭像就好（顏色不動） */
  | { kind: 'image'; barId: string; file: File }
  /** 調整某位角色的頭像範圍 */
  | { kind: 'avatar'; barId: string }
  /** 從立繪補取色：依序替這些角色重新取某個部位 */
  | { kind: 'refill'; role: KeyRole; ids: string[] };

interface FlowState {
  job: FlowJob | null;
  /** 編輯視窗開著的角色 */
  editing: string | null;
  /** 圈頭像的視窗開著（拖進來、貼上的圖片＝換這一張） */
  cropOpen: boolean;
  /** 圈頭像時拖進來、貼上的圖片（AddFlow 收到後換掉正在圈的那一張；n 讓同一個檔案也算新的一次） */
  dropped: { file: File; n: number } | null;
}

export const useFlow = create<FlowState>(() => ({
  job: null,
  editing: null,
  cropOpen: false,
  dropped: null,
}));

let dropCount = 0;
/** 圈頭像時拖進來、貼上的圖片：交給 AddFlow 換掉正在圈的那一張 */
export const dropIntoCrop = (file: File) => useFlow.setState({ dropped: { file, n: ++dropCount } });

export const startJob = (job: FlowJob) => useFlow.setState({ job });
export const endJob = () => useFlow.setState({ job: null, cropOpen: false, dropped: null });
export const openEditor = (barId: string) => useFlow.setState({ editing: barId });
export const closeEditor = () => useFlow.setState({ editing: null });

/** 上一次新增角色時圈的頭像範圍（「同上一張的範圍」；這次開頁有效） */
let lastPlacement: FramePlacement | null = null;
export const getLastPlacement = () => lastPlacement;
export const setLastPlacement = (p: FramePlacement) => {
  lastPlacement = p;
};

/** 頭像裡的主色（自動取色）：頭像依範圍畫成 64 × 64，交給 dominantInCircle */
export function dominantOf(
  bitmap: CanvasImageSource,
  size: { width: number; height: number },
  placement: FramePlacement,
): string {
  const side = 64;
  const c = makeCanvas(side, side);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return '#888888';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawPlacedCrop(ctx, bitmap, size, { x: 0, y: 0, width: side, height: side }, placement);
  return dominantInCircle(ctx.getImageData(0, 0, side, side));
}
