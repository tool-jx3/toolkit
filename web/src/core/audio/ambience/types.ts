/**
 * 環境音的定義（型別）。每個聲音是一個純函式：給參數、長度、取樣率與亂數，寫出一整段首尾相接的取樣。
 */
import type { Random } from '@/core/timeline/random';

export type AmbienceCategoryId =
  | 'noise'
  | 'weather'
  | 'water'
  | 'fire'
  | 'indoor'
  | 'life'
  | 'mood';

/** 滑桿參數（0～100 之類的整數） */
export interface AmbienceRangeParam {
  kind: 'range';
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** 兩端的說明（例如 ['近', '遠']），顯示在滑桿下方 */
  ends?: readonly [string, string];
  /** 數值的單位（預設不顯示單位；百分比用 '%'） */
  unit?: string;
}

/** 選項參數（值是選項的索引） */
export interface AmbienceChoiceParam {
  kind: 'choice';
  id: string;
  label: string;
  options: readonly string[];
  default: number;
}

export type AmbienceParam = AmbienceRangeParam | AmbienceChoiceParam;

export type AmbienceParams = Record<string, number>;

/** render 收到的環境 */
export interface RenderContext {
  sampleRate: number;
  /** 取樣數（整段） */
  n: number;
  /** 秒數（＝n ÷ sampleRate） */
  seconds: number;
  rng: Random;
  /** 左聲道（單聲道的聲音只寫這個） */
  left: Float32Array;
  /** 右聲道；單聲道的聲音是 null */
  right: Float32Array | null;
}

export interface AmbienceSoundDef {
  id: string;
  category: AmbienceCategoryId;
  /** 名稱（繁中） */
  label: string;
  /** 一句話說明 */
  description: string;
  /** 立體聲（false：單聲道，播放時兩邊一樣） */
  stereo: boolean;
  params: readonly AmbienceParam[];
  /** 最後乘上的音量（校準：預設參數時連續的聲音約 −14 dBFS RMS） */
  gain: number;
  /** 合成：寫進 ctx.left／ctx.right（已經是 0） */
  render(ctx: RenderContext, params: AmbienceParams): void;
}
