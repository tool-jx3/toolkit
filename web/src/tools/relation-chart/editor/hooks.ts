/** 編輯畫面共用的 hook：目前的分頁、畫法用的 ctx、圖片網址 */
import { useCallback, useMemo } from 'react';
import { type SheetCtx, sheetCtx } from '../engine/geom';
import type { ImageHref } from '../engine/nodes';
import type { Sheet } from '../model/types';
import { drawnImageIds, useImageUrls } from '../state/images';
import { activeIndex, useProject } from '../state/store';

export const useSheet = (): Sheet => useProject((s) => s.data.sheets[activeIndex(s.data)]);

/** 分頁的 ctx（帶專案的標籤、文件字型、匯入的字型、頭像框庫） */
export function useCtx(sheet: Sheet): SheetCtx {
  const labels = useProject((s) => s.data.labels);
  const font = useProject((s) => s.data.font);
  const fonts = useProject((s) => s.data.fonts);
  const frames = useProject((s) => s.data.frames);
  return useMemo(
    () => sheetCtx(sheet, labels, { font, fonts, frames }),
    [sheet, labels, font, fonts, frames],
  );
}

/** 目前分頁用到的圖（含頭像框庫）的網址 */
export function useHref(sheet: Sheet): ImageHref {
  const frames = useProject((s) => s.data.frames);
  const ids = useMemo(() => drawnImageIds({ sheets: [sheet], frames }), [sheet, frames]);
  const urls = useImageUrls(ids);
  return useCallback((id: string) => urls.get(id) ?? null, [urls]);
}
