/**
 * 頁面圖片（2026-10，上游 v3.14.0～v3.16.0 的 pageImgs；規格 3.18.1）：不在段落的串列裡、直接疊在頁上的圖片。
 * 位置是紙的左上角到圖片左上角的距離（mm）；本文加字也不會動。本文的文字避開圖片（單欄頁）。
 */

import {
  bodyWidthMm,
  copyImageFx,
  FREE_GAP,
  fixImageFx,
  imageWidthMmOf,
  PAPER_H,
  PAPER_W,
} from './image';
import { BOX_COLORS } from './proc';
import { uid } from './text';
import type { Block, Doc, PageImg } from './types';

/** 有說明時圖片下方那一行的大約高度（mm；只用在文字的避開與靠角） */
export const CAP_H = 6;
/** 與文字的距離的上限（mm） */
export const PIMG_GAP_MAX = 30;

export const pimgRound = (v: number): number => Math.round((+v || 0) * 10) / 10;
export const pimgGapClamp = (v: number): number =>
  Math.max(0, Math.min(PIMG_GAP_MAX, Math.round((+v || 0) * 10) / 10));

/** 與文字的距離：上下（v）預設 1.5 mm、左右（h）預設 3 mm */
export function pimgGap(o: Pick<PageImg, 'gv' | 'gh'>): { v: number; h: number } {
  return {
    v: o.gv != null ? pimgGapClamp(o.gv) : FREE_GAP / 2,
    h: o.gh != null ? pimgGapClamp(o.gh) : FREE_GAP,
  };
}

const num = (v: unknown, d = 0): number => (Number.isFinite(+(v as number)) ? +(v as number) : d);

/** 讀入的頁面圖片整理（沒有圖的不要） */
export function cleanPimgs(list: unknown): PageImg[] {
  if (!Array.isArray(list)) return [];
  const out: PageImg[] = [];
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Partial<PageImg> & Record<string, unknown>;
    if (!o.img || typeof o.img !== 'string') continue;
    const n: PageImg = {
      id: String(o.id || uid()),
      img: o.img,
      ar: num(o.ar) > 0 ? num(o.ar) : 0,
      cap: String(o.cap ?? ''),
      pg: Math.max(1, Math.round(num(o.pg, 1) || 1)),
      x: num(o.x),
      y: num(o.y),
      w: num(o.w) > 0 ? num(o.w) : 40,
      wu: o.wu === 'px' ? 'px' : 'pct',
    };
    for (const k of ['gv', 'gh'] as const)
      if (o[k] != null && String(o[k]) !== '' && Number.isFinite(+(o[k] as number)))
        n[k] = pimgGapClamp(+(o[k] as number));
    if (o.wrap === 'none') n.wrap = 'none';
    copyImageFx(o, n);
    fixImageFx(n, BOX_COLORS);
    out.push(n);
  }
  return out;
}

/** 圖片的外框（mm）：高＝寬 × 長寬比（有說明時加 6 mm）；位置收在紙裡 */
export function pimgBox(
  o: PageImg,
  doc: Pick<Doc, 'padH'>,
): { x: number; y: number; w: number; h: number } {
  const w = imageWidthMmOf(o, doc, 'page');
  const h = w * (+o.ar || 0) + (String(o.cap ?? '').trim() ? CAP_H : 0);
  return {
    x: Math.max(0, Math.min(PAPER_W - w, +o.x || 0)),
    y: Math.max(0, Math.min(PAPER_H - h, +o.y || 0)),
    w,
    h,
  };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const CORNERS: readonly (readonly [Corner, string])[] = [
  ['tl', '左上'],
  ['tr', '右上'],
  ['bl', '左下'],
  ['br', '右下'],
];

/** 對齊版心（紙面間距以內）的角落（不四捨五入，欄位顯示到 0.1 mm） */
export function cornerPos(
  o: PageImg,
  c: Corner,
  doc: Pick<Doc, 'padH' | 'padV'>,
): { x: number; y: number } {
  const b = pimgBox(o, doc);
  return {
    x: c[1] === 'l' ? doc.padH : PAPER_W - doc.padH - b.w,
    y: c[0] === 't' ? doc.padV : PAPER_H - doc.padV - b.h,
  };
}

/** 靠到版心的一邊（新版另外保留的「靠上緣／下緣／左緣／右緣」，F154、D24） */
export function edgePos(
  o: PageImg,
  which: 'top' | 'bottom' | 'left' | 'right',
  doc: Pick<Doc, 'padH' | 'padV'>,
): { x: number; y: number } {
  const b = pimgBox(o, doc);
  let { x, y } = b;
  if (which === 'top') y = doc.padV;
  if (which === 'bottom') y = Math.max(0, PAPER_H - doc.padV - b.h);
  if (which === 'left') x = doc.padH;
  if (which === 'right') x = Math.max(0, PAPER_W - doc.padH - b.w);
  return { x, y };
}

/**
 * 舊原稿的「自由配置」（以及原作 v3.11～v3.13 的「靠角」）圖片段落 → 頁面圖片（同原作）：
 * 自由配置的位置照用，寬的％從紙寬換成版心寬；靠角的換成那個角的座標。
 */
export function freeToPimg(b: Block & { corner?: string }, padH: number, padV: number): PageImg {
  const bodyW = Math.max(20, PAPER_W - padH * 2);
  const o: PageImg = {
    id: b.id || uid(),
    img: String(b.img ?? ''),
    ar: +(b.ar ?? 0) > 0 ? +(b.ar ?? 0) : 0,
    cap: String(b.cap ?? ''),
    pg: Math.max(1, +(b.pg ?? 1) || 1),
    x: 0,
    y: 0,
    w: 40,
    wu: 'pct',
  };
  if (['tl', 'tr', 'bl', 'br'].includes(String(b.corner))) {
    o.w = Math.max(1, Math.min(100, +(b.w ?? 0) || 40));
    const w = (bodyW * o.w) / 100;
    const h = w * o.ar + (o.cap.trim() ? CAP_H : 0);
    const c = String(b.corner);
    o.x = c[1] === 'l' ? padH : PAPER_W - padH - w;
    o.y = c[0] === 't' ? padV : PAPER_H - padV - h;
  } else {
    const wOld = (PAPER_W * Math.max(1, Math.min(100, +(b.w ?? 0) || 40))) / 100;
    o.w = Math.max(1, Math.min(100, Math.round((wOld / bodyW) * 100)));
    o.x = +(b.fx ?? 0) || 0;
    o.y = +(b.fy ?? 0) || 0;
  }
  o.x = pimgRound(o.x);
  o.y = pimgRound(o.y);
  if (b.wrap === 'none') o.wrap = 'none';
  copyImageFx(b, o);
  return o;
}

/** 放在哪一頁（0 起算）：超過總頁數 n 的放在最後一頁 */
export const pimgPage = (o: Pick<PageImg, 'pg'>, n: number): number =>
  Math.max(0, Math.min(Math.max(1, n) - 1, Math.max(1, +o.pg || 1) - 1));

/** 放在第 i 頁（0 起算）的頁面圖片；n＝總頁數（不給時只看 pg，不收超出的） */
export function pimgsOn(doc: Pick<Doc, 'pageImgs'>, i: number, n?: number): PageImg[] {
  const list = doc.pageImgs ?? [];
  return n == null
    ? list.filter((o) => Math.max(1, +o.pg || 1) - 1 === i)
    : list.filter((o) => pimgPage(o, n) === i);
}

export interface ShapeBox {
  side: 'left' | 'right';
  /** 上方讓位的高（mm；寬 0 的浮動框） */
  spacer: number;
  /** 避開的框的寬（mm）與高（mm） */
  width: number;
  height: number;
  /** 不分頁的匯出：寬是版心寬的％ */
  widthPct: number;
}

/**
 * 文字避開頁面圖片的浮動框（同原作 v3.14.0～v3.16.0）：單欄頁、知道長寬比、與版心有重疊的圖片。
 * 圖片中心在版心左半時靠左（寬＝圖片右緣 − 版心左緣 ＋ 左右距離），否則靠右；
 * 上緣＝圖片上緣 − padV − 上下距離、下緣＝圖片下緣 − padV ＋ 上下距離（分頁時最多到版心底）。
 * 由上而下排：同一側的下一個框從前一個框的下緣起算，另一側從前一個框的上緣起算
 * （浮動框不能放在先放的浮動框上面），前面先放一個寬 0 的框讓位。
 * flow：不分頁的匯出（以本文的開頭為原點、寬換成版心寬的％）。
 */
export function pimgShapes(
  list: readonly PageImg[],
  doc: Pick<Doc, 'padH' | 'padV'>,
  pageCols: number,
  flow = false,
): ShapeBox[] {
  /* 雙欄頁：浮動框只進得了第一欄、會打亂分欄，不避開 */
  if (pageCols === 2 || !list.length) return [];
  const cl = doc.padH;
  const cr = PAPER_W - doc.padH;
  const bw = cr - cl;
  const bodyH = PAPER_H - doc.padV * 2;
  const items: { side: 'left' | 'right'; sw: number; top: number; bot: number }[] = [];
  for (const o of list) {
    if (!(+o.ar > 0) || o.wrap === 'none') continue;
    const b = pimgBox(o, doc);
    let x0 = b.x;
    let y0 = b.y;
    let w = b.w;
    if (flow) {
      w = Math.min(w, bw);
      x0 = cl + Math.max(0, Math.min(bw - w, x0 - cl));
      y0 = doc.padV + Math.max(0, y0 - doc.padV);
    }
    if (x0 + w <= cl || x0 >= cr) continue;
    const useLeft = x0 + w / 2 <= (cl + cr) / 2;
    const g = pimgGap(o);
    const sw = useLeft ? Math.min(cr, x0 + w) - cl + g.h : cr - Math.max(cl, x0) + g.h;
    const top = Math.max(0, y0 - doc.padV - g.v);
    const bot = flow ? y0 - doc.padV + b.h + g.v : Math.min(bodyH, y0 - doc.padV + b.h + g.v);
    if (sw <= 0 || bot <= top) continue;
    items.push({ side: useLeft ? 'left' : 'right', sw: Math.min(sw, bw), top, bot });
  }
  items.sort((p, q) => p.top - q.top);
  const cur = { left: 0, right: 0 };
  let last = 0;
  const out: ShapeBox[] = [];
  for (const it of items) {
    const start = Math.max(cur[it.side], last);
    const top = Math.max(it.top, start);
    if (it.bot <= top) continue;
    out.push({
      side: it.side,
      spacer: top - start,
      width: it.sw,
      height: it.bot - top,
      widthPct: (it.sw / bw) * 100,
    });
    last = top;
    cur[it.side] = it.bot;
  }
  return out;
}

/** 不分頁的匯出：這頁的頁面圖片的位置（以本文開頭為原點；寬與左是版心寬的％） */
export function pimgFlowBox(
  o: PageImg,
  doc: Pick<Doc, 'padH' | 'padV'>,
): { left: number; top: number; width: number } {
  const b = pimgBox(o, doc);
  const bw = bodyWidthMm(doc);
  const w = Math.min(b.w, bw);
  const x = Math.max(0, Math.min(bw - w, b.x - doc.padH));
  return { left: (x / bw) * 100, top: Math.max(0, b.y - doc.padV), width: (w / bw) * 100 };
}

/** 刪除頁面時（F201）：刪掉那些頁上的頁面圖片，之後的頁號往前移 */
export function dropPagesPimgs(
  doc: Pick<Doc, 'pageImgs'>,
  idx: readonly number[],
  n: number,
): number {
  const before = doc.pageImgs.length;
  doc.pageImgs = doc.pageImgs.filter((o) => !idx.includes(pimgPage(o, n)));
  for (const o of doc.pageImgs) {
    const p = pimgPage(o, n);
    o.pg = p + 1 - idx.filter((i) => i < p).length;
  }
  return before - doc.pageImgs.length;
}
