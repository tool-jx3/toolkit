/**
 * 表情產生器的 React 小工具：通知、圖層解析、部件名稱、內建部件的縮圖。
 */
import { useCallback, useMemo } from 'react';
import { type ToastTone, useToast } from '@/ui';
import { CATEGORY_ORDER, type Category, type CustomPart } from './logic';
import { BUILTIN_PARTS, type BuiltinPart, builtinPart, HEAD_LAYERS } from './parts';
import { type LayerResolver, renderStack } from './render';
import { useCustomImages, useEmotions } from './store';

/** 通知（F45）：約 1.9 秒後淡出、新通知取代舊的；錯誤訊息留久一點讓人看完 */
export const NOTICE_MS = 1900;

export function useNotify() {
  const toast = useToast();
  return useCallback(
    (title: string, tone: ToastTone = 'info', description?: string) =>
      toast({
        title,
        tone,
        description,
        duration: tone === 'danger' ? 4000 : NOTICE_MS,
        replace: true,
      }),
    [toast],
  );
}

/** 部件 id → 可以畫的圖層（內建＝向量；自訂＝已讀到的圖片，沒有圖時 null） */
export function useLayerResolver(): LayerResolver {
  const customParts = useEmotions((s) => s.data.customParts);
  const images = useCustomImages((s) => s.images);
  return useMemo(() => {
    const custom = new Map(customParts.map((p) => [p.id, p]));
    return (id: string) => {
      const b = builtinPart(id);
      if (b) return { kind: 'vector', id, part: b };
      const p = custom.get(id);
      const image = p?.assetId ? images[p.assetId] : undefined;
      return image ? { kind: 'image', id, image } : null;
    };
  }, [customParts, images]);
}

/** 部件 id → 名稱（內建與自訂） */
export function usePartNames(): (id: string) => string | undefined {
  const customParts = useEmotions((s) => s.data.customParts);
  return useMemo(() => {
    const custom = new Map(customParts.map((p) => [p.id, p.name]));
    return (id: string) => builtinPart(id)?.name ?? custom.get(id);
  }, [customParts]);
}

/** 每一類的所有選項 id（內建在前、自訂在後；隨機的候選） */
export function candidatesOf(customParts: readonly CustomPart[]): Record<Category, string[]> {
  const out = {} as Record<Category, string[]>;
  for (const c of CATEGORY_ORDER) {
    out[c] = [
      ...BUILTIN_PARTS[c].map((p) => p.id),
      ...customParts.filter((p) => p.category === c).map((p) => p.id),
    ];
  }
  return out;
}

/** 選項縮圖用的內建圖層（畫一次就留著）；畫不出來的部件記在 failed（F46） */
export const THUMB_PX = 176;

let thumbCache: { layers: Map<string, HTMLCanvasElement>; failed: BuiltinPart[] } | null = null;

export function builtinThumbLayers(): {
  layers: Map<string, HTMLCanvasElement>;
  failed: BuiltinPart[];
} {
  if (thumbCache) return thumbCache;
  const layers = new Map<string, HTMLCanvasElement>();
  const failed: BuiltinPart[] = [];
  for (const part of [...HEAD_LAYERS, ...CATEGORY_ORDER.flatMap((c) => BUILTIN_PARTS[c])]) {
    try {
      layers.set(part.id, renderStack([{ kind: 'vector', id: part.id, part }], THUMB_PX));
    } catch {
      failed.push(part);
    }
  }
  thumbCache = { layers, failed };
  return thumbCache;
}
