/**
 * 裝飾圖章（規格 1.9）：SVG（可以改色）或圖片。第一次用到時載入，之後複製。
 * 大小：圖章原始外接框的長邊＝一格 × 大小（3.4）；以中心定位；翻轉＝負的縮放（與舊版的存檔相同）。
 */
import { FabricImage, type FabricObject, Group, loadSVGFromString, util } from 'fabric';
import { findDecor } from '../decorCatalog';
import { decorUrl } from '../decors';
import type { UserDecor } from '../model';
import type { MapObj } from './objects';

interface DecorAsset {
  state: 'loading' | 'ready' | 'error';
  base?: FabricObject;
  /** SVG 每個形狀原本的填色、線條（改色時沒指定的維持原色） */
  colors?: { fill: unknown; stroke: unknown }[];
  baseWidth?: number;
  baseHeight?: number;
  isSvg?: boolean;
  promise?: Promise<DecorAsset>;
}

const cache = new Map<string, DecorAsset>();
let userDecors: readonly UserDecor[] = [];
let onLoaded: (() => void) | null = null;

export function setDecorLoadedHandler(fn: (() => void) | null): void {
  onLoaded = fn;
}

/** 這張地圖的自訂裝飾 */
export function setUserDecors(list: readonly UserDecor[]): void {
  userDecors = list;
}

export function forgetDecor(id: string): void {
  cache.delete(id);
}

interface Source {
  isSvg: boolean;
  /** SVG 原文（自訂裝飾） */
  raw?: string | null;
  url?: string | null;
  scale: number;
}

function sourceOf(id: string): Source | null {
  const user = userDecors.find((d) => d.id === id);
  if (user)
    return {
      isSvg: user.type === 'svg',
      raw: user.rawSvg,
      url: user.dataUrl,
      scale: user.scale ?? 1,
    };
  const def = findDecor(id);
  if (def) return { isSvg: true, url: decorUrl(id), scale: def.scale };
  return null;
}

/** 自訂裝飾或內建裝飾的名稱 */
export function decorName(id: string | null | undefined): string {
  if (!id) return '';
  return userDecors.find((d) => d.id === id)?.name ?? findDecor(id)?.name ?? id;
}

export function isSvgDecor(id: string | null | undefined): boolean {
  if (!id) return false;
  const s = sourceOf(id);
  return !!s?.isSvg;
}

async function svgText(src: Source): Promise<string> {
  if (src.raw) return src.raw;
  if (!src.url) throw new Error('沒有圖檔');
  if (src.url.startsWith('data:')) {
    const res = await fetch(src.url);
    return res.text();
  }
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 載入（已經載入或載入中時回傳同一個） */
export function loadDecor(id: string): Promise<DecorAsset> {
  const hit = cache.get(id);
  if (hit?.promise) return hit.promise;
  if (hit && hit.state !== 'loading') return Promise.resolve(hit);
  const src = sourceOf(id);
  const entry: DecorAsset = { state: 'loading' };
  entry.promise = (async () => {
    try {
      if (!src) throw new Error('沒有這個裝飾');
      if (src.isSvg) {
        const { objects, options } = await loadSVGFromString(await svgText(src));
        const list = objects.filter((o): o is FabricObject => !!o);
        if (!list.length) throw new Error('SVG 是空的');
        entry.colors = list.map((o) => ({ fill: o.fill, stroke: o.stroke }));
        const base = util.groupSVGElements(list, options);
        entry.base = base;
        entry.baseWidth = (base.width ?? 1) * (base.scaleX ?? 1);
        entry.baseHeight = (base.height ?? 1) * (base.scaleY ?? 1);
        entry.isSvg = true;
      } else {
        const img = await FabricImage.fromURL(src.url ?? '', { crossOrigin: 'anonymous' });
        entry.base = img;
        entry.baseWidth = img.width;
        entry.baseHeight = img.height;
        entry.isSvg = false;
      }
      entry.state = 'ready';
      onLoaded?.();
    } catch {
      entry.state = 'error';
    }
    return entry;
  })();
  cache.set(id, entry);
  return entry.promise;
}

export interface DecorOptions {
  centerX: number;
  centerY: number;
  /** 使用者的大小倍率（1＝100%） */
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  fill: string | null;
  stroke: string | null;
  preview?: boolean;
}

/** 依目前的設定做一個圖章（複製載入好的原型）；還沒載入好或載入失敗時 null */
export async function createDecorInstance(
  id: string,
  opts: DecorOptions,
  cellSize: number,
): Promise<MapObj | null> {
  const asset = await loadDecor(id);
  if (asset.state !== 'ready' || !asset.base) return null;
  const src = sourceOf(id);
  const clone = (await asset.base.clone()) as MapObj;
  const total = (src?.scale ?? 1) * (opts.scale ?? 1);
  const baseDim = Math.max(asset.baseWidth ?? 1, asset.baseHeight ?? 1) || 1;
  const fit = (cellSize / baseDim) * total;
  clone.set({
    originX: 'center',
    originY: 'center',
    left: opts.centerX,
    top: opts.centerY,
    scaleX: fit * (opts.flipX ? -1 : 1),
    scaleY: fit * (opts.flipY ? -1 : 1),
    angle: opts.rotation || 0,
    objectCaching: false,
  });
  Object.assign(clone, {
    _decorId: id,
    _isDecorLayer: true,
    _decorIsSvg: !!asset.isSvg,
    _decorScale: opts.scale ?? 1,
    _decorFlipX: !!opts.flipX,
    _decorFlipY: !!opts.flipY,
    _decorFill: opts.fill || null,
    _decorStroke: opts.stroke || null,
  });
  if (asset.isSvg) {
    const children = clone instanceof Group ? clone.getObjects() : [clone];
    children.forEach((child, i) => {
      const orig = asset.colors?.[i] ?? { fill: child.fill, stroke: child.stroke };
      child.set({
        fill: (opts.fill ?? orig.fill) as string,
        stroke: (opts.stroke ?? orig.stroke) as string,
        dirty: true,
      });
    });
    clone.set('dirty', true);
  }
  if (opts.preview) {
    clone.set({ opacity: 0.5, selectable: false, evented: false, excludeFromExport: true });
    clone.isPreview = true;
  }
  return clone;
}
