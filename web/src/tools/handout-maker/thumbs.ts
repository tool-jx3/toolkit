/**
 * 道具清單的縮圖（規格 F01）：同一段程式畫成長邊 180 px 的小圖。
 *
 * 清單可以有 60 張：字型的一個分片載好（字寬快取清掉）或圖片讀好時，每一張都要重畫，一次全部畫會卡住打字。
 * 所以縮圖在閒置時分批重畫（每批約 8 ms，目前這張優先），還沒重畫的先顯示舊的縮圖；
 * 字型只替「內容變了的那一張」請求（每張的 fontNeeds 依內容快取），打字時每一鍵的工作量不隨張數增加。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { bumpFontTick, type FontNeed, loadFonts, useFontTick } from './fonts';
import { type Handout, handoutAssetIds } from './model';
import { type AnyCanvas, fontNeeds, renderThumb } from './render';
import { assets } from './store';

/** 縮圖的長邊（px） */
export const THUMB_SIDE = 180;
/** 一批最多畫多久（ms） */
const SLICE_MS = 8;

interface Entry {
  h: Handout;
  key: string;
  canvas: AnyCanvas;
}

type Idle = (cb: () => void) => () => void;

/** 閒置時執行（沒有 requestIdleCallback 時用 setTimeout） */
const whenIdle: Idle = (cb) => {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 250 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 16);
  return () => clearTimeout(id);
};

const needsCache = new WeakMap<Handout, FontNeed[]>();
/** 一張要的字（依內容快取：沒改的那幾張不必每一鍵都重算） */
export function needsOf(h: Handout): FontNeed[] {
  let n = needsCache.get(h);
  if (!n) {
    n = fontNeeds(h);
    needsCache.set(h, n);
  }
  return n;
}

/** 替還沒請求過的那幾張載入字型（打字時通常只有正在編輯的那一張） */
function useListFonts(items: readonly Handout[]): void {
  const requested = useRef(new WeakSet<Handout>());
  useEffect(() => {
    const fresh = items.filter((h) => !requested.current.has(h));
    if (!fresh.length) return;
    for (const h of fresh) requested.current.add(h);
    void loadFonts(fresh.flatMap(needsOf))
      .catch(() => false)
      .then((changed) => {
        if (changed) bumpFontTick();
      });
  }, [items]);
}

/**
 * 每一張的縮圖（id → 畫布）。內容、圖片、字型沒變的不重畫；要重畫的在閒置時分批畫，目前這張（activeId）優先。
 */
export function useThumbs(items: readonly Handout[], activeId: string): Map<string, AnyCanvas> {
  const ids = useMemo(() => items.flatMap(handoutAssetIds), [items]);
  const { bitmaps } = useAssetBitmaps(assets, ids);
  useListFonts(items);
  const tick = useFontTick();
  const cache = useRef(new Map<string, Entry>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const imgOf = (h: Handout) => (h.image ? (bitmaps.get(h.image.id) ?? null) : null);
    const bgOf = (h: Handout) => (h.bg.image ? (bitmaps.get(h.bg.image.id) ?? null) : null);
    const keyOf = (h: Handout) =>
      `${tick}|${imgOf(h) ? h.image?.id : ''}|${bgOf(h) ? h.bg.image?.id : ''}`;
    /* 拿掉已經不在清單裡的 */
    const alive = new Set(items.map((h) => h.id));
    for (const id of cache.current.keys()) if (!alive.has(id)) cache.current.delete(id);
    const queue = items.filter((h) => {
      const c = cache.current.get(h.id);
      return !c || c.h !== h || c.key !== keyOf(h);
    });
    if (!queue.length) return;
    /* 目前這張先畫 */
    queue.sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
    let cancel: (() => void) | null = null;
    const run = () => {
      cancel = null;
      const start = performance.now();
      let drawn = 0;
      while (queue.length) {
        const h = queue.shift() as Handout;
        const key = keyOf(h);
        try {
          cache.current.set(h.id, {
            h,
            key,
            canvas: renderThumb(h, THUMB_SIDE, imgOf(h), bgOf(h)),
          });
        } catch {
          /* 畫不出來時留著舊的縮圖（清單仍可操作） */
        }
        drawn++;
        if (performance.now() - start > SLICE_MS) break;
      }
      if (drawn) setVersion((v) => v + 1);
      if (queue.length) cancel = whenIdle(run);
    };
    cancel = whenIdle(run);
    return () => {
      cancel?.();
    };
  }, [items, bitmaps, tick, activeId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version 是縮圖畫好了
  return useMemo(() => {
    const out = new Map<string, AnyCanvas>();
    for (const [id, e] of cache.current) out.set(id, e.canvas);
    return out;
  }, [version]);
}
