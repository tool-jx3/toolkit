/**
 * 測試入口（e2e 用）：window.__screenshotFx——讀寫內容、畫任一個時間的畫面、時間軸、播放位置。
 */
import { type RefObject, useEffect } from 'react';
import { ensureCreditFont } from './exporter';
import { buildTimeline, computeLayout, type FxState, normalizeState } from './model';
import type { PlayerHandle } from './Preview';
import { RenderCache, renderToCanvas } from './render';
import { assets, docNow, prefsNow, select, useDoc, useLive } from './store';

declare global {
  interface Window {
    __screenshotFx?: Record<string, (...args: never[]) => unknown>;
  }
}

export function useTestHook(player: RefObject<PlayerHandle | null>) {
  useEffect(() => {
    const image = async () => {
      const s = docNow();
      return s.image ? ((await assets.bitmap(s.image.id)) ?? null) : null;
    };
    window.__screenshotFx = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      /** 換掉部分內容（整理後套用，一步復原） */
      set: (patch: Partial<FxState>) =>
        useDoc.getState().replace(normalizeState({ ...docNow(), ...patch })),
      select: (id: string | null) => select(id, true),
      live: () => {
        const l = useLive.getState();
        return { selected: l.selected, tab: l.tab, missing: l.missing };
      },
      timeline: () => buildTimeline(docNow().timing, docNow().frames),
      layout: () => {
        const s = docNow();
        return computeLayout(s, s.image);
      },
      /** t 秒的畫面（data URL） */
      render: async (t: number) => {
        const s = docNow();
        await ensureCreditFont(s);
        const c = renderToCanvas({ state: s, image: await image() }, t, new RenderCache());
        return (c as HTMLCanvasElement).toDataURL('image/png');
      },
      /** t 秒的畫面上幾個點的顏色（RGBA） */
      pixels: async (t: number, points: [number, number][]) => {
        const s = docNow();
        await ensureCreditFont(s);
        const c = renderToCanvas({ state: s, image: await image() }, t, new RenderCache());
        const g = (c as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
        return points.map(([x, y]) =>
          Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data),
        );
      },
      player: () => {
        const p = player.current;
        return p ? { time: p.time, playing: p.playing, duration: p.duration } : null;
      },
      seek: (t: number) => player.current?.seek(t),
    };
    return () => {
      delete window.__screenshotFx;
    };
  }, [player]);
}
