/**
 * 效果與輸出（純函式，Worker 與主執行緒共用；不依賴 DOM）。
 *
 * 依主控裁定：預覽與下載跑同一段處理（所見即所得）；效果畫在角色後面、不改變角色本身的像素
 * （含半透明的邊）；線條的透明度就是設定值；陰影是整個剪影的偏移影子；兩種光暈有區別。
 * 這些都由共用的剪影效果（core/image 的 applySilhouetteEffects／outlineLayers）提供。
 *
 * 模糊的強度以舊版**下載的檔案**為準（對等驗證後的追加裁定）：σ ＝ 模糊值，光暈是粗細 N 的那一圈線模糊後的光
 * （outlineLayers 的 blurMode: 'filter'）；強烈與柔和的光暈總量都和舊版下載相近，柔和比強烈淡。
 */
import { encodePng } from '@/core/encode/png';
import { applySilhouetteEffects, outlineLayers, type SilhouetteLayer } from '@/core/image/effects';
import type { EffectStyle, RgbaBuffer, Settings } from './logic';

export interface EffectParams {
  style: EffectStyle;
  /** #rrggbb */
  color: string;
  /** 粗細 px */
  width: number;
  /** 模糊 px（σ ＝ 模糊值；實線不用；光暈至少當 1 px） */
  blur: number;
  /** 陰影往右下的位移 px */
  offset: number;
  /** 0～1 */
  opacity: number;
}

/** 目前設定的效果參數；沒開效果時是 null */
export function effectParams(s: Settings): EffectParams | null {
  if (!s.effectOn) return null;
  return {
    style: s.effectStyle,
    color: s.effectColor,
    width: s.effectWidth,
    blur: s.effectBlur,
    offset: s.effectOffset,
    opacity: s.effectOpacity / 100,
  };
}

/** 參數的比對鍵（只放這個樣式用得到的參數：例如實線不看模糊） */
export function effectKey(p: EffectParams | null): string {
  if (!p) return 'off';
  const parts: (string | number)[] = [p.style, p.color, p.width, p.opacity];
  if (p.style !== 'stroke') parts.push(p.blur);
  if (p.style === 'shadow') parts.push(p.offset);
  return parts.join(',');
}

export function effectLayers(p: EffectParams): SilhouetteLayer[] {
  return outlineLayers(p.style, {
    color: p.color,
    width: p.width,
    blur: p.blur,
    offset: p.offset,
    opacity: p.opacity,
    blurMode: 'filter',
  });
}

/** 在裁切後的像素上加效果（尺寸不變；角色像素原封不動） */
export function applyEffects(rgba: RgbaBuffer, p: EffectParams): RgbaBuffer {
  return applySilhouetteEffects(rgba, effectLayers(p));
}

/** 下載的 PNG（8-bit RGBA）：有效果時先加效果；像素原值照存，不經過畫布 */
export async function encodeOutput(
  rgba: RgbaBuffer,
  p: EffectParams | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const out = p ? applyEffects(rgba, p) : rgba;
  return encodePng(out.data, out.width, out.height);
}
