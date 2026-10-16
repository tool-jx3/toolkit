/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯入的字型在編輯畫面註冊成 FontFace（家族名 crf-<資產 id>；原作的 fontFaceSync）。載入失敗不報錯：
 * 畫面沿後備字型顯示，檔案照樣保存與內嵌。字型從庫裡刪掉時一起取消註冊。
 */
import { useEffect } from 'react';
import { importedFamily } from '../engine/geom';
import type { FontItem } from '../model/types';
import { assets } from '../state/store';

const registered = new Map<string, FontFace>();

export function syncFontFaces(fonts: readonly FontItem[]): void {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  const want = new Set(fonts.map((f) => f.id));
  for (const [id, ff] of registered) {
    if (want.has(id)) continue;
    try {
      document.fonts.delete(ff);
    } catch {
      /* 已經不在了 */
    }
    registered.delete(id);
  }
  for (const f of fonts) {
    if (registered.has(f.id)) continue;
    const id = f.id;
    /* 先佔位，避免重複註冊 */
    registered.set(id, null as unknown as FontFace);
    void assets
      .url(id)
      .then((url) => {
        if (!url || !registered.has(id)) {
          registered.delete(id);
          return;
        }
        const ff = new FontFace(importedFamily(id), `url("${url}")`);
        registered.set(id, ff);
        document.fonts.add(ff);
        ff.load().catch(() => {});
      })
      .catch(() => registered.delete(id));
  }
}

/** 專案的匯入字型跟著註冊 */
export function useFontFaces(fonts: readonly FontItem[]): void {
  useEffect(() => syncFontFaces(fonts), [fonts]);
}
