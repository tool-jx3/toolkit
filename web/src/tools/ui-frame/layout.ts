/**
 * 版面（規格 3.1、3.4，自訂）：所有部件的位置與大小都以 1920 × 1080 為準（原圖 px），
 * 1280 × 720 時乘上 2/3（尺寸、座標各自四捨五入）。
 *
 * 每個部件匯出成 PNG 時四周留透明邊（陰影、光暈、按下時往下沉的空間）：框類 24 px、按鈕 32 px；
 * 同一個按鈕的四種狀態大小相同。
 */
import type { Design, Resolution } from './model';

export const BASE_W = 1920;
export const BASE_H = 1080;
/** 框類（訊息框、名字框、TRPG 的各種框）四周的透明邊 */
export const FRAME_PAD = 24;
/** 按鈕（選項、系統按鈕）四周的透明邊 */
export const BUTTON_PAD = 32;
/** 翻頁游標的 PNG 大小 */
export const CURSOR_SIZE = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 解析度的倍率（1920 → 1、1280 → 2/3） */
export const scaleOf = (res: Resolution): number => res / BASE_W;

/** 1920 基準的長度 → 輸出 px（四捨五入，至少 1） */
export const px = (v: number, res: Resolution): number => Math.max(1, Math.round(v * scaleOf(res)));
/** 1920 基準的座標 → 輸出 px（四捨五入） */
export const pos = (v: number, res: Resolution): number => Math.round(v * scaleOf(res));

export const screenSize = (res: Resolution) => ({ width: res, height: Math.round(res * (9 / 16)) });

/* ---------- 文字冒險 ---------- */

export const NAME_PLATE = { w: 320, h: 60, dx: 40, dy: -36 };
export const SYS_BUTTON = { w: 120, h: 40, gap: 8, right: 20, above: 14 };
export const CHOICE = { h: 68, top: 200, gap: 100 };
/** 訊息框裡文字的範圍（相對於框） */
export const MSG_TEXT = { left: 64, right: 64, top: 56, bottom: 40, size: 28, lineHeight: 46 };
export const MSG_BOTTOM = 40;

export interface NovelLayout {
  msg: Rect;
  name: Rect;
  /** 翻頁游標的中心 */
  cursor: { cx: number; cy: number };
  sys: { x: number; y: number; w: number; h: number; gap: number }[];
  choices: Rect[];
}

export function messageRect(d: Pick<Design, 'msgW' | 'msgH'>): Rect {
  return {
    x: Math.round((BASE_W - d.msgW) / 2),
    y: BASE_H - d.msgH - MSG_BOTTOM,
    w: d.msgW,
    h: d.msgH,
  };
}

export function novelLayout(d: Pick<Design, 'msgW' | 'msgH' | 'choiceW'>): NovelLayout {
  const msg = messageRect(d);
  const name: Rect = {
    x: msg.x + NAME_PLATE.dx,
    y: msg.y + NAME_PLATE.dy,
    w: NAME_PLATE.w,
    h: NAME_PLATE.h,
  };
  const n = 8;
  const total = n * SYS_BUTTON.w + (n - 1) * SYS_BUTTON.gap;
  const startX = msg.x + msg.w - SYS_BUTTON.right - total;
  /* 系統按鈕（含透明邊）碰到名字框時，整排移到名字框上方 */
  const overlapsName = startX - BUTTON_PAD < name.x + name.w + FRAME_PAD + 8;
  const sysY = overlapsName ? name.y - SYS_BUTTON.h - 16 : msg.y - SYS_BUTTON.h - SYS_BUTTON.above;
  const sys = Array.from({ length: n }, (_, i) => ({
    x: startX + i * (SYS_BUTTON.w + SYS_BUTTON.gap),
    y: sysY,
    w: SYS_BUTTON.w,
    h: SYS_BUTTON.h,
    gap: SYS_BUTTON.gap,
  }));
  const cx = Math.round((BASE_W - d.choiceW) / 2);
  const choices = [0, 1, 2].map((i) => ({
    x: cx,
    y: CHOICE.top + i * CHOICE.gap,
    w: d.choiceW,
    h: CHOICE.h,
  }));
  return {
    msg,
    name,
    cursor: { cx: msg.x + msg.w - 52, cy: msg.y + msg.h - 42 },
    sys,
    choices,
  };
}

/** 訊息框能放幾行文字 */
export function messageLines(msgH: number): number {
  return Math.max(1, Math.floor((msgH - MSG_TEXT.top - MSG_TEXT.bottom) / MSG_TEXT.lineHeight));
}

/* ---------- TRPG・直播 ---------- */

/** 整個畫面的外框：外緣往內 16、中間透明的窗往內 52 */
export const SCREEN_FRAME = { inset: 16, hole: 52 };
export const PORTRAIT = { x: 100, y: 104, w: 360, h: 520, hole: 24, holeH: 420 };
export const STATUS = { x: 500, y: 104, w: 300, h: 76, gap: 96 };
export const DICE = { w: 420, h: 260, right: 100, y: 104 };

export interface TrpgLayout {
  screen: Rect;
  screenHole: Rect;
  portrait: Rect;
  portraitHole: Rect;
  /** 角色框裡名字的範圍（窗下面那一條） */
  portraitName: Rect;
  status: Rect[];
  dice: Rect;
  board: Rect;
}

export function trpgLayout(d: Pick<Design, 'msgW' | 'msgH'>): TrpgLayout {
  const s = SCREEN_FRAME;
  const p = PORTRAIT;
  return {
    screen: { x: s.inset, y: s.inset, w: BASE_W - s.inset * 2, h: BASE_H - s.inset * 2 },
    screenHole: { x: s.hole, y: s.hole, w: BASE_W - s.hole * 2, h: BASE_H - s.hole * 2 },
    portrait: { x: p.x, y: p.y, w: p.w, h: p.h },
    portraitHole: { x: p.x + p.hole, y: p.y + p.hole, w: p.w - p.hole * 2, h: p.holeH },
    portraitName: {
      x: p.x + p.hole,
      y: p.y + p.hole + p.holeH,
      w: p.w - p.hole * 2,
      h: p.h - p.hole - p.holeH,
    },
    status: [0, 1, 2].map((i) => ({
      x: STATUS.x,
      y: STATUS.y + i * STATUS.gap,
      w: STATUS.w,
      h: STATUS.h,
    })),
    dice: { x: BASE_W - DICE.right - DICE.w, y: DICE.y, w: DICE.w, h: DICE.h },
    board: messageRect(d),
  };
}

/** 加上透明邊的範圍（PNG 的範圍，1920 基準） */
export const padRect = (r: Rect, pad: number): Rect => ({
  x: r.x - pad,
  y: r.y - pad,
  w: r.w + pad * 2,
  h: r.h + pad * 2,
});
