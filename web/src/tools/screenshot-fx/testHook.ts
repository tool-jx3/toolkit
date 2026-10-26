/**
 * 測試入口（e2e 用）：window.__screenshotFx——讀寫內容、畫任一個時間的畫面、時間軸、播放位置。
 */
import { type RefObject, useEffect } from 'react';
import { ensureCreditFont } from './exporter';
import {
  cameraView,
  computeLayout,
  type FxState,
  type LayerId,
  normalizeState,
  stepProgress,
  timelineOf,
} from './model';
import type { PlayerHandle } from './Preview';
import { RenderCache, type RenderOptions, renderToCanvas } from './render';
import { assets, docNow, edit, prefsNow, select, useLive } from './store';

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
        edit((d) => {
          Object.assign(d, normalizeState({ ...docNow(), ...patch }));
        }),
      select: (id: string | null) => select(id, true),
      live: () => {
        const l = useLive.getState();
        return {
          selected: l.selected,
          tab: l.tab,
          missing: l.missing,
          cameraPreview: l.cameraPreview,
          viewZoom: l.viewZoom,
          pointer: l.pointer,
          expanded: l.expanded,
        };
      },
      timeline: () => timelineOf(docNow()),
      /** 運鏡在 t 秒看的範圍（全圖時 null） */
      cameraView: (t: number) => {
        const s = docNow();
        return cameraView(s, computeLayout(s, s.image), timelineOf(s), t);
      },
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
      /**
       * t 秒的畫面上幾個點的顏色（RGBA）；opts：camera（套用運鏡）、layer（圖層）、step（逐步公開的第幾張）
       */
      pixels: async (
        t: number,
        points: [number, number][],
        opts: { camera?: boolean; layer?: LayerId; step?: number } = {},
      ) => {
        const s = docNow();
        await ensureCreditFont(s);
        const r: RenderOptions = { layer: opts.layer };
        if (opts.camera) r.view = cameraView(s, computeLayout(s, s.image), timelineOf(s), t);
        if (opts.step !== undefined) r.progress = stepProgress(s.frames, opts.step);
        const c = renderToCanvas({ state: s, image: await image() }, t, new RenderCache(), r);
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
