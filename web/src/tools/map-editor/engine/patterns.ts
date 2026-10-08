/**
 * 地面（填色）與牆壁（線條）的圖樣（規格 F110～F114、3.4）：只有自訂圖樣（使用者上傳的圖片，跟著地圖儲存）。
 * 圖樣以世界座標的原點對齊；線條的縮放先縮放圖片本身（Fabric 把圖樣變換套在線條上時會連線寬一起縮放）。
 */
import { type FabricObject, Pattern } from 'fabric';
import type { PatternState, UserPattern } from '../model';
import { type MapObj, worldTopLeft } from './objects';

interface CacheEntry {
  state: 'loading' | 'ready' | 'error';
  img?: HTMLImageElement;
}

const images = new Map<string, CacheEntry>();
const scaledSources = new Map<string, HTMLCanvasElement>();
let onLoaded: (() => void) | null = null;

/** 圖片載入完成時（重畫畫布） */
export function setPatternLoadedHandler(fn: (() => void) | null): void {
  onLoaded = fn;
}

let defs: readonly UserPattern[] = [];

/** 這張地圖的自訂圖樣（開啟地圖、上傳、刪除時更新） */
export function setUserPatterns(list: readonly UserPattern[]): void {
  defs = list;
  for (const p of list) loadPatternImage(p);
}

export function patternDef(id: string | null | undefined): UserPattern | null {
  return (id && defs.find((p) => p.id === id)) || null;
}

function loadPatternImage(def: UserPattern): void {
  if (images.has(def.id)) return;
  images.set(def.id, { state: 'loading' });
  const img = new Image();
  img.onload = () => {
    images.set(def.id, { state: 'ready', img });
    onLoaded?.();
  };
  img.onerror = () => images.set(def.id, { state: 'error' });
  img.src = def.dataUrl;
}

/** 全部的圖片都載入了沒（畫布要等它們） */
export async function waitPatternImages(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while ([...images.values()].some((e) => e.state === 'loading') && Date.now() - start < timeoutMs)
    await new Promise((r) => setTimeout(r, 30));
}

/** 填色用（地面）：圖片還沒載入時用單色代替 */
export function patternFill(id: string | null, fallback: string): string | Pattern {
  const def = patternDef(id);
  if (!def) return fallback || '#888888';
  const c = images.get(def.id);
  if (c?.state === 'ready' && c.img) return new Pattern({ source: c.img, repeat: 'repeat' });
  if (!c) loadPatternImage(def);
  return def.color || fallback || '#888888';
}

/** 線條用（牆壁）：圖片先縮放（圖樣的倍率 × 使用者的縮放），圖樣變換只放旋轉 */
export function strokePatternFill(
  id: string | null,
  fallback: string,
  userScale: number,
): string | Pattern {
  const def = patternDef(id);
  if (!def) return fallback || '#888888';
  const c = images.get(def.id);
  if (c?.state !== 'ready' || !c.img) {
    if (!c) loadPatternImage(def);
    return def.color || fallback || '#888888';
  }
  const total = (def.scale ?? 1) * (userScale ?? 1);
  if (total === 1) return new Pattern({ source: c.img, repeat: 'repeat' });
  const key = `${def.id}@${total}`;
  let scaled = scaledSources.get(key);
  if (!scaled) {
    const w = Math.max(1, Math.round(c.img.naturalWidth * total));
    const h = Math.max(1, Math.round(c.img.naturalHeight * total));
    scaled = document.createElement('canvas');
    scaled.width = w;
    scaled.height = h;
    scaled.getContext('2d')?.drawImage(c.img, 0, 0, w, h);
    scaledSources.set(key, scaled);
  }
  return new Pattern({ source: scaled, repeat: 'repeat' });
}

/** 地面的填色（單色或圖樣） */
export function groundFill(s: PatternState): string | Pattern {
  if (s.mode === 'solid') return s.solidColor || '#888888';
  return patternFill(s.id, s.solidColor);
}

/** 牆壁的線條（單色或圖樣） */
export function wallStroke(s: PatternState, userScale: number): string | Pattern {
  if (s.mode === 'solid') return s.solidColor || '#333333';
  return strokePatternFill(s.id, s.solidColor, userScale);
}

/** 圖樣定義的初始倍率（沒有圖樣時 1） */
export function defScale(id: string | null | undefined): number {
  return patternDef(id)?.scale ?? 1;
}

/** 圖樣的位移與變換：fill、stroke 各自的偏移、旋轉、縮放 */
export interface PatternParams {
  offX: number;
  offY: number;
  deg: number;
  scale: number;
}

/**
 * 把物件的填色、線條上的圖樣對齊到世界原點（舊版 applyPatternTransformOnObj）。
 * fill 用 fillP（縮放、旋轉放在圖樣變換），stroke 用 strokeP（只放旋轉）。
 */
export function applyPatternTransform(
  o: MapObj,
  fillP: PatternParams,
  strokeP: PatternParams = fillP,
): void {
  const ref = worldTopLeft(o);
  let changed = false;
  if (o.fill instanceof Pattern) {
    const r = (fillP.deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const s = fillP.scale || 1;
    o.fill.offsetX = -ref.x + fillP.offX;
    o.fill.offsetY = -ref.y + fillP.offY;
    o.fill.patternTransform =
      s === 1 && fillP.deg === 0 ? undefined : [s * cos, s * sin, -s * sin, s * cos, 0, 0];
    changed = true;
  }
  if (o.stroke instanceof Pattern) {
    const r = (strokeP.deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    o.stroke.offsetX = -ref.x + strokeP.offX;
    o.stroke.offsetY = -ref.y + strokeP.offY;
    o.stroke.patternTransform = strokeP.deg === 0 ? undefined : [cos, sin, -sin, cos, 0, 0];
    changed = true;
  }
  if (changed) o.dirty = true;
}

/** 依物件自己記的設定（_patternOffsetX…）重新對齊（移動之後、讀進來之後） */
export function applyPatternOrigin(o: FabricObject): void {
  const m = o as MapObj;
  const p: PatternParams = {
    offX: m._patternOffsetX || 0,
    offY: m._patternOffsetY || 0,
    deg: m._patternRotation || 0,
    scale: m._patternScale ?? 1,
  };
  applyPatternTransform(m, p, p);
}

/** 換掉物件的圖樣選擇（選取物件改圖樣，F055；舊版 applyPatternStateToTarget） */
export function applyPatternStateToTarget(
  target: MapObj,
  fillSide: boolean,
  state: PatternState,
): void {
  const oldDefScale = defScale(target._patternState?.id ?? null);
  target._patternState = { ...state };
  if (fillSide)
    target.set(
      'fill',
      state.mode === 'solid'
        ? state.solidColor || '#888888'
        : patternFill(state.id, state.solidColor),
    );
  else
    target.set(
      'stroke',
      state.mode === 'solid'
        ? state.solidColor || '#333333'
        : strokePatternFill(state.id, state.solidColor, (target._patternScale ?? 1) / oldDefScale),
    );
  if (state.mode === 'pattern') {
    const userScale = (target._patternScale ?? 1) / oldDefScale;
    target._patternScale = defScale(state.id) * userScale;
  }
  applyPatternOrigin(target);
  target.dirty = true;
}

/** 刪掉自訂圖樣時清快取 */
export function forgetPattern(id: string): void {
  images.delete(id);
  for (const k of [...scaledSources.keys()]) if (k.startsWith(`${id}@`)) scaledSources.delete(k);
}
