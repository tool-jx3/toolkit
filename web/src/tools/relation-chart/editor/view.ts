/**
 * 畫布的視角（平移、縮放）：zoom＝每個畫布單位幾個螢幕 px，x／y＝SVG 左上角在畫布框裡的位置。
 * 編輯列、鍵盤、小地圖、角色清單都透過這裡改視角。
 */
import { activeSheet, setUi, useUi, type View } from '../state/store';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

interface Bound {
  el: HTMLElement;
  /** SVG 的大小與畫布在 SVG 裡的偏移 */
  content: () => { viewW: number; viewH: number; pad: number };
}

let bound: Bound | null = null;

export function bindView(b: Bound | null): void {
  bound = b;
}

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export function hostRect(): DOMRect | null {
  return bound?.el.getBoundingClientRect() ?? null;
}

export function contentBox(): { viewW: number; viewH: number; pad: number } {
  return bound?.content() ?? { viewW: 1000, viewH: 1000, pad: 0 };
}

/** 整張（含出血與界外的圖例）放進畫面 */
export function fitView(): void {
  const r = hostRect();
  if (!r || r.width < 10 || r.height < 10) return;
  const { viewW, viewH } = contentBox();
  const m = r.width < 500 ? 8 : 24;
  const zoom = clampZoom(Math.min((r.width - m) / viewW, (r.height - m) / viewH));
  setUi({
    view: { zoom, x: (r.width - viewW * zoom) / 2, y: (r.height - viewH * zoom) / 2 },
  });
}

/** 以畫面上的一點（client 座標；沒給＝畫面中央）為中心縮放 */
export function zoomBy(f: number, clientX?: number, clientY?: number): void {
  const r = hostRect();
  if (!r) return;
  const v = useUi.getState().view;
  const zoom = clampZoom(v.zoom * f);
  const k = zoom / v.zoom;
  const cx = (clientX ?? r.left + r.width / 2) - r.left;
  const cy = (clientY ?? r.top + r.height / 2) - r.top;
  setUi({ view: { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k } });
}

export function setView(v: View): void {
  setUi({ view: { ...v, zoom: clampZoom(v.zoom) } });
}

/** client 座標 → 畫布座標 */
export function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const r = hostRect();
  const v = useUi.getState().view;
  const { pad } = contentBox();
  if (!r) return { x: 0, y: 0 };
  return {
    x: (clientX - r.left - v.x) / v.zoom - pad,
    y: (clientY - r.top - v.y) / v.zoom - pad,
  };
}

/** 把畫布上的一點移到畫面中央（倍率至少 minZoom） */
export function centerOn(x: number, y: number, minZoom = 0): void {
  const r = hostRect();
  if (!r) return;
  const v = useUi.getState().view;
  const zoom = clampZoom(Math.max(v.zoom, minZoom));
  const { pad } = contentBox();
  setUi({
    view: { zoom, x: r.width / 2 - (x + pad) * zoom, y: r.height / 2 - (y + pad) * zoom },
  });
}

export function centerOnChar(id: number, minZoom = 0): void {
  const c = activeSheet().chars.find((x) => x.id === id);
  if (c) centerOn(c.x, c.y, minZoom);
}
