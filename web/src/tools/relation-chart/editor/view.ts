/**
 * 畫布的視角（平移、縮放）：zoom＝每個畫布單位幾個螢幕 px，x／y＝SVG 左上角在畫布框裡的位置。
 * 編輯列、鍵盤、小地圖、角色清單都透過這裡改視角。
 */
import { activeSheet, type LodLevel, setUi, useUi, type View } from '../state/store';

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

/**
 * 畫布框裡面的原點（client 座標）：getBoundingClientRect 含外框線，絕對定位的圖層（畫布、框選、長按的圈）
 * 從框線內側開始，換算游標時要扣掉框線（差 1 px＝陣營名稱的角度、框選的邊界會偏）。
 */
export function hostOrigin(el: HTMLElement | null | undefined = bound?.el): {
  left: number;
  top: number;
} | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left + el.clientLeft, top: r.top + el.clientTop };
}

export function contentBox(): { viewW: number; viewH: number; pad: number } {
  return bound?.content() ?? { viewW: 1000, viewH: 1000, pad: 0 };
}

/** 「符合畫面」的倍率：整張（含出血與界外的圖例）放進畫布框，四周留一點邊 */
function fitZoom(w: number, h: number): number {
  const { viewW, viewH } = contentBox();
  const m = w < 500 ? 8 : 24;
  return Math.min((w - m) / Math.max(1, viewW), (h - m) / Math.max(1, viewH));
}

/**
 * 遠近簡化的倍率（原作的 state.scale：1＝按「符合畫面」之後的倍率，原作 resetViewToFit 把它設成 1）。
 * 本站的 zoom 是「每個畫布單位幾個螢幕 px」，直接拿來比 0.5／1 會在大畫布一開就進「遠」。
 */
export function lodScale(zoom: number, hostW: number, hostH: number): number {
  const fit = fitZoom(hostW, hostH);
  return fit > 0 ? zoom / fit : 1;
}

/** 三檔與遲滯（原作的 updateLOD：≥ 1＝近、0.5～1＝中、< 0.5＝遠；換檔要多跨 0.03） */
export function nextLod(prev: LodLevel, s: number): LodLevel {
  const H = 0.03;
  if (prev === 'far') return s >= 0.5 + H ? (s >= 1 ? 'near' : 'mid') : 'far';
  if (prev === 'mid') return s < 0.5 - H ? 'far' : s >= 1 + H ? 'near' : 'mid';
  return s < 1 - H ? (s < 0.5 ? 'far' : 'mid') : 'near';
}

/** 整張（含出血與界外的圖例）放進畫面 */
export function fitView(): void {
  const r = hostRect();
  if (!r || r.width < 10 || r.height < 10) return;
  const { viewW, viewH } = contentBox();
  const zoom = clampZoom(fitZoom(r.width, r.height));
  setUi({
    view: { zoom, x: (r.width - viewW * zoom) / 2, y: (r.height - viewH * zoom) / 2 },
  });
}

/** 以畫面上的一點（client 座標；沒給＝畫面中央）為中心縮放 */
export function zoomBy(f: number, clientX?: number, clientY?: number): void {
  const r = hostRect();
  if (!r) return;
  const o = hostOrigin() ?? r;
  const v = useUi.getState().view;
  const zoom = clampZoom(v.zoom * f);
  const k = zoom / v.zoom;
  const cx = (clientX ?? r.left + r.width / 2) - o.left;
  const cy = (clientY ?? r.top + r.height / 2) - o.top;
  setUi({ view: { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k } });
}

export function setView(v: View): void {
  setUi({ view: { ...v, zoom: clampZoom(v.zoom) } });
}

/** client 座標 → 畫布座標 */
export function toCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const o = hostOrigin();
  const v = useUi.getState().view;
  const { pad } = contentBox();
  if (!o) return { x: 0, y: 0 };
  return {
    x: (clientX - o.left - v.x) / v.zoom - pad,
    y: (clientY - o.top - v.y) / v.zoom - pad,
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
