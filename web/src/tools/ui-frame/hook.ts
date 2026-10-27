/**
 * 測試與對等驗證用的入口 window.__uiFrame：讀狀態、素材清單、畫一張素材（PNG 的 data URL）、TyranoScript 程式碼、預覽的按鈕範圍。
 */
import { useEffect } from 'react';
import { makeCanvas } from '@/core/image';
import { ensureAssetFonts } from './exporter';
import { useMine } from './mine';
import { partsOf, renderPart } from './parts';
import { docNow, prefsNow, useSession } from './store';
import { tyranoCode } from './tyrano';

declare global {
  interface Window {
    __uiFrame?: unknown;
  }
}

export function useTestHook() {
  useEffect(() => {
    window.__uiFrame = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      mine: () => useMine.getState().data,
      session: () => {
        const s = useSession.getState();
        return { hover: s.hover, pressed: s.pressed, font: s.font, busy: s.busy };
      },
      parts: () =>
        partsOf(docNow()).map((p) => ({
          id: p.id,
          file: p.file,
          name: p.name,
          group: p.group,
          width: p.width,
          height: p.height,
        })),
      part: async (id: string) => {
        const doc = docNow();
        const part = partsOf(doc).find((p) => p.id === id);
        if (!part) return null;
        await ensureAssetFonts(doc);
        const c = renderPart(part, doc.resolution, makeCanvas) as HTMLCanvasElement;
        return c.toDataURL('image/png');
      },
      code: () => tyranoCode(docNow(), docNow().base.name),
    };
  }, []);
}
