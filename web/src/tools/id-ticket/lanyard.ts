/**
 * 掛繩（規格 F27 修訂、D31～D34）：證件與 SF 證件共用的四種選擇
 * - 'preview'：只在預覽上畫掛繩與扣環（以前的做法，預設；匯出沒有，逐位元組和以前相同）；
 * - 'none'：不要；
 * - 'hole'：卡上打一個掛繩孔（匯出的 PNG 裡是透明的洞；印刷用是白的）；
 * - 'strap'：掛繩孔＋畫出掛繩與扣環（匯出的 PNG 往上延伸；印刷用不畫掛繩）。
 *
 * 掛繩孔：圓頭的長條孔、水平置中在卡片上緣（直式、橫式都一樣：卡片照目前的方向掛）。
 * - 既有的證件（設計單位，1 mm＝5.5）：13 × 3.2 mm、上緣離卡片上緣 3.5 mm；掛繩往上 20 mm（同預覽的掛繩）。
 * - SF 證件（原生像素）：260 × 56（同原作通行證的孔）、離卡片外形的上緣 16～40；通行證用它本來的孔；掛繩往上 400。
 * 掛繩、扣環、穿過孔的扣片都依孔的寬度等比例（u＝孔寬 ÷ 71.5）。
 */
import { mmToDots } from '@/core/paged/units';
import { shade } from './colors';
import type { Ctx } from './kit';
import type { SfBlankId } from './sf/defs';
import { type Pt, type Rect, roundRectPoly } from './sf/geom';
import type { Orientation } from './templates';

export const LANYARD_MODES = ['preview', 'none', 'hole', 'strap'] as const;
export type LanyardMode = (typeof LANYARD_MODES)[number];

/** 匯出時有沒有洞／掛繩 */
export const lanyardHole = (m: LanyardMode): boolean => m === 'hole' || m === 'strap';
export const lanyardStrap = (m: LanyardMode): boolean => m === 'strap';

/* ---------- 既有的證件（設計單位） ---------- */

const MM = 5.5;
export const ID_SLOT_MM = { w: 13, h: 3.2, top: 3.5 } as const;
/** 掛繩往上延伸（設計單位；20 mm，同預覽的掛繩 STRAP_H） */
export const ID_STRAP_U = 110;
/** 掛繩往上延伸的 mm（匯出用） */
export const ID_STRAP_MM = ID_STRAP_U / MM;

/** 既有的證件的掛繩孔（設計單位、原點在成品的左上角） */
export function idSlot(o: Orientation): Rect {
  const W = o === 'portrait' ? 54 * MM : 86 * MM;
  const w = ID_SLOT_MM.w * MM;
  return { x: (W - w) / 2, y: ID_SLOT_MM.top * MM, w, h: ID_SLOT_MM.h * MM };
}

/** 匯出時掛繩往上延伸幾 px（600 dpi：20 mm → 472） */
export const idStrapPixels = (dpi: number): number => Math.round(mmToDots(ID_STRAP_MM, dpi));

/* ---------- SF 證件（原生像素） ---------- */

/** 每一款的孔（通行證是本來就有的孔） */
export const SF_SLOTS: Record<SfBlankId, Rect> = {
  event: { x: 470, y: 85, w: 260, h: 56 },
  citizen: { x: 670, y: 86, w: 260, h: 56 },
  license: { x: 670, y: 66, w: 260, h: 56 },
  operator: { x: 670, y: 56, w: 260, h: 56 },
  pass: { x: 370, y: 92, w: 260, h: 56 },
};

/** 卡片外形在孔的正上方的上緣（扣環停在它上面） */
export const SF_CARD_TOP: Record<SfBlankId, number> = {
  event: 45,
  citizen: 70,
  license: 50,
  operator: 40,
  pass: 40,
};

/** SF 證件的掛繩往上延伸（原生像素） */
export const SF_STRAP_PX = 400;

/* ---------- 形狀 ---------- */

/** 孔的外形（圓頭） */
export const slotPoly = (r: Rect): Pt[] => roundRectPoly(r.x, r.y, r.w, r.h, r.h / 2);

export interface StrapGeom {
  /** 掛繩（從畫布上緣到扣環） */
  ribbon: Rect;
  /** 扣環 */
  clip: Rect;
  /** 穿過孔的扣片（到孔的中間，下緣是半圓） */
  tab: Rect;
  /** 比例（孔寬 ÷ 71.5） */
  u: number;
}

/**
 * 掛繩的幾何（座標同孔；top＝畫布的上緣〔負的：卡片上方延伸出去的地方〕、cardTop＝卡片在孔正上方的上緣）。
 */
export function strapGeometry(slot: Rect, cardTop: number, top: number): StrapGeom {
  const u = slot.w / (ID_SLOT_MM.w * MM);
  const cx = slot.x + slot.w / 2;
  const clipH = 30 * u;
  const clipW = 50 * u;
  const clipY = cardTop - 6 * u - clipH;
  const ribbonW = 34 * u;
  const tabW = 22 * u;
  const tabTop = clipY + clipH - 4 * u;
  return {
    ribbon: { x: cx - ribbonW / 2, y: top, w: ribbonW, h: clipY + 4 * u - top },
    clip: { x: cx - clipW / 2, y: clipY, w: clipW, h: clipH },
    tab: { x: cx - tabW / 2, y: tabTop, w: tabW, h: slot.y + slot.h / 2 - tabTop },
    u,
  };
}

function rr(ctx: Ctx, r: Rect, rad: number): void {
  const k = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.lineTo(r.x + r.w - k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + k, k);
  ctx.lineTo(r.x + r.w, r.y + r.h - k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x + r.w - k, r.y + r.h, k);
  ctx.lineTo(r.x + k, r.y + r.h);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y + r.h - k, k);
  ctx.lineTo(r.x, r.y + k);
  ctx.arcTo(r.x, r.y, r.x + k, r.y, k);
  ctx.closePath();
}

/** 畫掛繩＋扣環＋扣片（color＝掛繩的顏色） */
export function drawStrap(ctx: Ctx, g: StrapGeom, color: string): void {
  const { ribbon, clip, tab, u } = g;
  ctx.save();
  /* 掛繩：底色＋左右的陰影＋細細的織紋 */
  ctx.fillStyle = color;
  ctx.fillRect(ribbon.x, ribbon.y, ribbon.w, ribbon.h);
  const side = ctx.createLinearGradient(ribbon.x, 0, ribbon.x + ribbon.w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.22)');
  side.addColorStop(0.22, 'rgba(0,0,0,0)');
  side.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  side.addColorStop(0.78, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = side;
  ctx.fillRect(ribbon.x, ribbon.y, ribbon.w, ribbon.h);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = ribbon.y; y < ribbon.y + ribbon.h; y += 4 * u)
    ctx.fillRect(ribbon.x, y, ribbon.w, 2 * u);
  /* 扣片（穿過孔；在扣環後面） */
  const tg = ctx.createLinearGradient(tab.x, 0, tab.x + tab.w, 0);
  tg.addColorStop(0, '#9fa4ad');
  tg.addColorStop(0.5, '#e3e5e9');
  tg.addColorStop(1, '#9fa4ad');
  rr(ctx, tab, tab.w / 2);
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.lineWidth = 1.2 * u;
  ctx.strokeStyle = '#80858e';
  ctx.stroke();
  /* 扣環 */
  const cg = ctx.createLinearGradient(0, clip.y, 0, clip.y + clip.h);
  cg.addColorStop(0, '#f1f2f4');
  cg.addColorStop(1, '#b4b8bf');
  rr(ctx, clip, 8 * u);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.lineWidth = 1.2 * u;
  ctx.strokeStyle = '#8d929b';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(clip.x + 6 * u, clip.y + 2 * u, clip.w - 12 * u, 1.4 * u);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(clip.x + clip.w / 2 - 9 * u, clip.y + clip.h * 0.55, 18 * u, 2 * u);
  ctx.restore();
}

/** 既有的證件的掛繩顏色（同預覽：主題色暗 10%） */
export const idStrapColor = (theme: string): string => shade(theme, 0.1);
