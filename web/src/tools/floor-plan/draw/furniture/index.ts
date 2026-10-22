/**
 * 家具的畫法（id → 畫法）。目錄（名稱、尺寸）在 model/assets.ts。
 */
import { BUILD } from './build';
import { FACILITY } from './facility';
import { HOME } from './home';
import { JAPANESE } from './japanese';
import type { FurnDraw } from './kit';
import { MYSTERY } from './mystery';
import { OUTDOOR } from './outdoor';
import { PEOPLE } from './people';
import { ROOMS } from './rooms';
import { STORY } from './story';
import { TRANSIT } from './transit';

export type { DrawOptions, FurnDraw, FurnStyle } from './kit';

export const FURNITURE_DRAW: Readonly<Record<string, FurnDraw>> = {
  ...HOME,
  ...FACILITY,
  ...STORY,
  ...BUILD,
  ...TRANSIT,
  ...OUTDOOR,
  ...JAPANESE,
  ...MYSTERY,
  ...PEOPLE,
  ...ROOMS,
};
