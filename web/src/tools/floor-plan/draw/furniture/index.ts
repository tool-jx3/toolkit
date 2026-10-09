/**
 * 家具的畫法（id → 畫法）。目錄（名稱、尺寸）在 model/assets.ts。
 */
import { FACILITY } from './facility';
import { HOME } from './home';
import type { FurnDraw } from './kit';
import { STORY } from './story';

export type { DrawOptions, FurnDraw, FurnStyle } from './kit';

export const FURNITURE_DRAW: Readonly<Record<string, FurnDraw>> = {
  ...HOME,
  ...FACILITY,
  ...STORY,
};
