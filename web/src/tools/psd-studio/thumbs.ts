/**
 * 預覽用的低解析度縮圖（最長邊 240 px，F17）：原圖縮圖（Worker 做好的 RGBA）＋目前調色後的 canvas。
 *
 * 改調色時不一次重算全部：每個畫面最多算約 8 ms，選取中的素材與畫面上看得到的優先（規格 4.：拖滑桿要順暢），
 * 其餘的接著在之後的畫面補上。算好就通知（useThumbVersion），各預覽重畫自己。
 */
import { useSyncExternalStore } from 'react';
import { applyAdjust, type CompiledAdjust } from './adjust';
import type { Thumb } from './process';

interface Entry {
  rev: number;
  src: Thumb;
  /** 套上圖層遮色片的縮圖（PSD 的配置檢視用） */
  masked: Thumb | null;
  canvas: HTMLCanvasElement | null;
  maskedCanvas: HTMLCanvasElement | null;
  /** canvas 目前對應的調色鍵 */
  key: string | null;
  want: { key: string; compile: () => CompiledAdjust } | null;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
/** 每個素材自己的版本（只重畫有變的縮圖） */
const idVersions = new Map<string, number>();
const bump = (id: string) => idVersions.set(id, version + 1);
let priority = new Set<string>();
let scheduled = false;
const BUDGET_MS = 8;

function notify() {
  version++;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 縮圖有更新時重畫（給 id 時只看那一張） */
export function useThumbVersion(id?: string): number {
  const get = () => (id === undefined ? version : (idVersions.get(id) ?? 0));
  return useSyncExternalStore(subscribe, get, get);
}

export function setThumb(id: string, rev: number, src: Thumb, masked: Thumb | null = null): void {
  const old = entries.get(id);
  entries.set(id, {
    rev,
    src,
    masked,
    canvas: null,
    maskedCanvas: null,
    key: null,
    want: old?.want ?? null,
  });
  bump(id);
  schedule();
  notify();
}

export function hasThumb(id: string, rev: number): boolean {
  return entries.get(id)?.rev === rev;
}

export function getThumbSource(id: string): { src: Thumb; masked: Thumb | null } | null {
  const e = entries.get(id);
  return e ? { src: e.src, masked: e.masked } : null;
}

/** 保留這些 id，其餘刪掉 */
export function keepThumbs(ids: Iterable<string>): void {
  const keep = new Set(ids);
  for (const id of [...entries.keys()]) if (!keep.has(id)) entries.delete(id);
}

export function clearThumbs(): void {
  for (const id of entries.keys()) bump(id);
  entries.clear();
  notify();
}

/** 調色後的縮圖（還沒算好時是上一次的結果；從沒算過時 null） */
export function getThumbCanvas(id: string, masked = false): HTMLCanvasElement | null {
  const e = entries.get(id);
  if (!e) return null;
  return masked && e.masked ? e.maskedCanvas : e.canvas;
}

/** 目前的縮圖已經是這個調色的結果 */
export function isThumbCurrent(id: string, key: string): boolean {
  return entries.get(id)?.key === key;
}

/** 要求每個素材的縮圖套用這組調色（同樣的鍵不重算） */
export function requestThumbs(
  list: readonly { id: string; key: string; compile: () => CompiledAdjust }[],
): void {
  let changed = false;
  for (const it of list) {
    const e = entries.get(it.id);
    if (!e) continue;
    if (e.key === it.key && !e.want) continue;
    if (e.want?.key === it.key) continue;
    e.want = { key: it.key, compile: it.compile };
    changed = true;
  }
  if (changed) schedule();
}

/** 優先處理的 id（選取中、畫面上看得到的） */
export function setThumbPriority(ids: Iterable<string>): void {
  priority = new Set(ids);
}

function render(
  src: Thumb,
  c: CompiledAdjust,
  target: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement('canvas');
  if (canvas.width !== src.width) canvas.width = src.width;
  if (canvas.height !== src.height) canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const px = src.rgba.slice();
  applyAdjust(px, c);
  ctx.putImageData(new ImageData(px, src.width, src.height), 0, 0);
  return canvas;
}

function pending(): [string, Entry][] {
  const out: [string, Entry][] = [];
  for (const [id, e] of entries) if (e.want && e.want.key !== e.key) out.push([id, e]);
  out.sort((a, b) => Number(priority.has(b[0])) - Number(priority.has(a[0])));
  return out;
}

function schedule() {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(tick);
}

function tick() {
  scheduled = false;
  const start = performance.now();
  let done = 0;
  for (const [id, e] of pending()) {
    const want = e.want!;
    const c = want.compile();
    e.canvas = render(e.src, c, e.canvas);
    if (e.masked) e.maskedCanvas = render(e.masked, c, e.maskedCanvas);
    e.key = want.key;
    e.want = null;
    bump(id);
    done++;
    if (performance.now() - start > BUDGET_MS) break;
  }
  for (const [, e] of entries) if (e.want && e.want.key === e.key) e.want = null;
  if (done) notify();
  if (pending().length) schedule();
}

/** 測試用：同步算完所有待處理的縮圖 */
export function flushThumbs(): void {
  for (const [id, e] of pending()) {
    const c = e.want!.compile();
    e.canvas = render(e.src, c, e.canvas);
    if (e.masked) e.maskedCanvas = render(e.masked, c, e.maskedCanvas);
    e.key = e.want!.key;
    e.want = null;
    bump(id);
  }
  notify();
}
