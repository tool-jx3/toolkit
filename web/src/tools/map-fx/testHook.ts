/**
 * 測試入口（e2e 用）：window.__mapFx——讀寫內容、畫任一個時間的畫面、時間軸、播放位置、點選路線的狀態、房間遮罩的畫法。
 */
import { type RefObject, useEffect } from 'react';
import type { LayerId } from '@/core/imagefx';
import { ensureFonts } from './exporter';
import {
  computeLayout,
  type MapState,
  normalizeState,
  routePath,
  stepProgress,
  timelineOf,
} from './model';
import type { PlayerHandle } from './Preview';
import { RenderCache, type RenderOptions, renderToCanvas } from './render';
import { assets, docNow, edit, prefsNow, select, useLive, usePoints } from './store';

declare global {
  interface Window {
    __mapFx?: Record<string, (...args: never[]) => unknown>;
  }
}

export function useTestHook(player: RefObject<PlayerHandle | null>) {
  useEffect(() => {
    const image = async () => {
      const s = docNow();
      return s.image ? ((await assets.bitmap(s.image.id)) ?? null) : null;
    };
    window.__mapFx = {
      doc: () => docNow(),
      prefs: () => prefsNow(),
      /** 換掉部分內容（整理後套用，一步復原） */
      set: (patch: Partial<MapState>) =>
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
          viewZoom: l.viewZoom,
          pointer: l.pointer,
          expanded: l.expanded,
        };
      },
      points: () => usePoints.getState().draft,
      timeline: () => timelineOf(docNow()),
      layout: () => {
        const s = docNow();
        return computeLayout(s, s.image);
      },
      /** 路線經過的點（原圖 px） */
      path: (id: string) => {
        const f = docNow().frames.find((x) => x.id === id);
        return f?.kind === 'route' ? routePath(f) : null;
      },
      /** t 秒的畫面（data URL） */
      render: async (t: number) => {
        const s = docNow();
        await ensureFonts(s);
        const c = renderToCanvas({ state: s, image: await image() }, t, new RenderCache());
        return (c as HTMLCanvasElement).toDataURL('image/png');
      },
      /** t 秒的畫面上幾個點的顏色（RGBA）；opts：layer（圖層）、step（段階公開的第幾張） */
      pixels: async (
        t: number,
        points: [number, number][],
        opts: { layer?: LayerId; step?: number } = {},
      ) => {
        const s = docNow();
        await ensureFonts(s);
        const r: RenderOptions = { layer: opts.layer };
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
      delete window.__mapFx;
    };
  }, [player]);
}
