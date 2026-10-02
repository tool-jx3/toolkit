/**
 * 測試與對等驗證用的入口（window.__foregroundFrame）：讀寫設定、以任意尺寸畫出某個差分、取檔名與窗的資訊。
 */
import { useEffect } from 'react';
import { exportName, renderFull } from './exporting';
import { canvasFontFamily, ensureStateFonts } from './fonts';
import { openingRect, windowInfo } from './geometry';
import { currentItem, defaultState, type FrameState, normalizeState } from './model';
import { render } from './render';
import { env } from './runtime';
import {
  assets,
  edit,
  frameNow,
  type PreviewData,
  useFrame,
  usePreview,
  useSession,
} from './store';

declare global {
  interface Window {
    __foregroundFrame?: unknown;
  }
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let o: Record<string, unknown> = obj;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

export function useTestHook(): void {
  useEffect(() => {
    window.__foregroundFrame = {
      state: (): FrameState => JSON.parse(JSON.stringify(frameNow())),
      /** 剛開啟時的設定（不改目前的） */
      defaults: (): FrameState => defaultState(),
      preview: (): PreviewData => ({ ...usePreview.getState().data }),
      session: () => {
        const s = useSession.getState();
        return { selected: s.selected, decoSelected: s.decoSelected, status: s.status };
      },
      /** 依「a.b.c」路徑改設定（一步復原） */
      set: (path: string, value: unknown) =>
        edit((d) => setPath(d as unknown as Record<string, unknown>, path, value)),
      replace: (s: unknown) => {
        useFrame.getState().replace(normalizeState(s));
      },
      setPreview: (patch: Partial<PreviewData>) => usePreview.getState().patch(patch),
      undoSteps: () => useFrame.temporal.getState().pastStates.length,
      redoSteps: () => useFrame.temporal.getState().futureStates.length,
      current: () => currentItem(frameNow(), usePreview.getState().data.current)?.id ?? null,
      /** 畫出某個差分（null＝沒開差分時的整體設計），回傳 ImageData */
      render: (slotId: string | null, w?: number, h?: number) => {
        const s = frameNow();
        const c = document.createElement('canvas');
        c.width = w ?? s.size.w;
        c.height = h ?? s.size.h;
        const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        const hits = render(ctx, s, env, slotId, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        return Object.assign(img, { hits });
      },
      renderFull: (slotId: string | null) => renderFull(frameNow(), env, slotId),
      ready: async () => {
        await ensureStateFonts(frameNow());
        const ids = frameNow()
          .layers.filter((l) => l.kind === 'image')
          .map((l) => (l as { asset: string }).asset);
        await Promise.all(ids.map((id) => assets.bitmap(id)));
      },
      exportName: (id: string | null) => {
        const s = frameNow();
        return exportName(s, id ? (s.variants.items.find((i) => i.id === id) ?? null) : null);
      },
      windowInfo: () => windowInfo(frameNow()),
      openingRect: () => openingRect(frameNow()),
      fontFamily: canvasFontFamily,
    };
  }, []);
}
