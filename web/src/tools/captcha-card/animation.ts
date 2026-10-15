/**
 * 動畫（規格 1.5、3.3）：游標一格一格點選勾選的圖片 → 按驗證 → 結尾（通過、失敗、錯誤文字、跳出視窗）。
 *
 * - 影格表（`buildTimeline`，純函式）：每一格是一個「畫面狀態」與它顯示多久（毫秒），GIF／APNG／WebP 照表輸出、預覽照表播放。
 * - 畫法（`drawOverlay`）：底圖（沒有勾選標示的卡片）之上依狀態畫勾選、按下的按鈕、錯誤文字、人機驗證小視窗、
 *   變暗、跳出視窗、點擊的漣漪、游標。座標一律是卡片單位。
 * - `createCaptchaSource`：底圖先以輸出的倍率畫好快取，包成 core/timeline 的 AnimationSource（預覽與匯出共用）。
 */
import { makeCanvas, type Rect, roundRectPath } from '@/core/image';
import {
  type AnimationSource,
  EASE,
  type FrameSpec,
  frameIndexAt,
  frameTableDuration,
  hashUnit,
  type TimelineSegment,
} from '@/core/timeline';
import { breakText } from '@/core/typeset';
import { type CardLayout, ellipsize, type Measure } from './layout';
import {
  type CaptchaState,
  clickOrder,
  type Ending,
  type PopIcon,
  SPEED_FACTOR,
  themeTextColor,
} from './model';
import {
  type AnyCanvas,
  type Ctx,
  canvasMeasure,
  drawCard,
  drawSelection,
  font,
  type ImageResolver,
  layoutFor,
} from './render';

/* ---------- 狀態 ---------- */

export interface Point {
  x: number;
  y: number;
}

export interface FrameState {
  /** 已經點了幾格（依點選順序，前 n 格畫勾選） */
  n: number;
  /** 勾選標示的不透明度（錯誤文字的結尾會淡掉） */
  selAlpha: number;
  cursor: (Point & { down: boolean }) | null;
  ripple: (Point & { r: number; a: number }) | null;
  /** 驗證按鈕按下 */
  press: boolean;
  /** 人機驗證小視窗：不透明度、縮放；spin＝轉圈的起始角度；result＝結果記號的大小（0.5、1） */
  robot: { a: number; sc: number; spin?: number; result?: number } | null;
  /** 錯誤文字的不透明度（0＝沒有） */
  err: number;
  /** 變暗（跳出視窗的背景） */
  dim: number;
  pop: { a: number; sc: number; press: boolean } | null;
  /** 左右搖晃的位移 */
  shake: number;
}

export type Phase = 'clicks' | 'verify' | 'ending';

export interface AnimFrame {
  ms: number;
  s: FrameState;
  /** 階段（播放列的分段）：點選（含開頭）、驗證、結尾 */
  phase: Phase;
}

const EMPTY: FrameState = {
  n: 0,
  selAlpha: 1,
  cursor: null,
  ripple: null,
  press: false,
  robot: null,
  err: 0,
  dim: 0,
  pop: null,
  shake: 0,
};

/* ---------- 小視窗與跳出視窗的版面 ---------- */

/** 人機驗證小視窗：寬 300、高 76，放在卡片正中央；勾選框 28（左邊 15、上下置中） */
export const ROBOT = {
  w: 300,
  h: 76,
  radius: 5,
  box: 28,
  boxX: 15,
  labelX: 56,
  label: 15,
} as const;

export function robotLayout(W: number, H: number): { box: Rect; check: Rect } {
  const box = { x: (W - ROBOT.w) / 2, y: (H - ROBOT.h) / 2, width: ROBOT.w, height: ROBOT.h };
  return {
    box,
    check: {
      x: box.x + ROBOT.boxX,
      y: box.y + (ROBOT.h - ROBOT.box) / 2,
      width: ROBOT.box,
      height: ROBOT.box,
    },
  };
}

export const POPUP = {
  maxW: 300,
  pad: 18,
  icon: 28,
  head: 46,
  foot: 56,
  line: 19,
  lines: 5,
  msg: { size: 13, weight: 400 },
  title: { size: 16, weight: 600 },
  button: { size: 13.5, weight: 600, h: 36, minW: 72, padX: 22 },
} as const;

export interface PopupLayout {
  box: Rect;
  lines: string[];
  bodyH: number;
  textX: number;
  button: Rect;
}

/** 跳出視窗：寬 min(300, 卡片寬 − 40)，置中；內容最多 5 行（13 號字、行高 19） */
export function popupLayout(
  W: number,
  H: number,
  pop: Pick<CaptchaState['popup'], 'message' | 'button'>,
  measure: Measure,
): PopupLayout {
  const P = POPUP;
  const w = Math.min(P.maxW, W - 40);
  const textX = P.pad + P.icon + 12;
  const textW = w - textX - P.pad;
  const lines = breakText(pop.message, {
    limit: textW,
    unit: (c) => measure(c, P.msg),
    segment: 'grapheme',
  })
    .map((l) => l.join(''))
    .slice(0, P.lines);
  const bodyH = Math.max(P.icon, lines.length * P.line) + 36;
  const h = P.head + bodyH + P.foot;
  const bw = Math.max(P.button.minW, measure(pop.button, P.button) + P.button.padX * 2);
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  return {
    box: { x, y, width: w, height: h },
    lines,
    bodyH,
    textX,
    button: { x: x + w - 14 - bw, y: y + P.head + bodyH + 10, width: bw, height: P.button.h },
  };
}

/* ---------- 影格表 ---------- */

export interface TimelineInput {
  W: number;
  H: number;
  /** 依點選順序的格子範圍 */
  clicks: Rect[];
  verify: Rect | null;
  ending: Ending;
  cursor: boolean;
  /** 速度倍數（慢 1.5、一般 1、快 0.65） */
  k: number;
  robot: { box: Rect; check: Rect };
  popButton: Rect | null;
}

/** 搖晃的位移（每格 40 ms） */
export const SHAKE = [-9, 9, -7, 7, -4, 4, -2, 0] as const;

/**
 * 影格表：
 * 開頭停 500 ms → 每個勾選的格子：游標移過去（4 格 × 40 ms，慢 6 格、快 3 格；S 形緩動）、按下 70、放開 60、停 90
 * → 停 380 → 按驗證（游標移過去、按下 90、放開 60、停 260）→ 結尾。沒有游標時每格只有一格「出現勾選、停 140」。
 * 停留的時間（不含游標移動與按下、放開）乘上速度倍數。每格至少 20 ms。
 */
export function buildTimeline(o: TimelineInput): AnimFrame[] {
  const D = (ms: number) => Math.round(ms * o.k);
  const T: AnimFrame[] = [];
  let st: FrameState = { ...EMPTY };
  let phase: Phase = 'clicks';
  const push = (patch: Partial<FrameState>, ms: number) => {
    st = { ...st, ...patch };
    T.push({ ms: Math.max(20, ms), s: st, phase });
  };
  if (o.cursor) st.cursor = { x: o.W * 0.84, y: o.H * 0.97, down: false };

  const move = (to: Point) => {
    if (!o.cursor || !st.cursor) return;
    const from = { x: st.cursor.x, y: st.cursor.y };
    const m = Math.max(3, Math.round(4 * o.k));
    for (let i = 1; i <= m; i++) {
      const t = EASE.smooth(i / m);
      push(
        {
          cursor: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, down: false },
          ripple: null,
        },
        40,
      );
    }
  };
  const click = (pt: Point, extra: Partial<FrameState>, hold: number) => {
    if (!o.cursor) {
      push(extra, hold);
      return;
    }
    push({ cursor: { ...pt, down: true }, ripple: { ...pt, r: 7, a: 0.55 }, ...extra }, 70);
    push({ cursor: { ...pt, down: false }, ripple: { ...pt, r: 17, a: 0.22 } }, 60);
    push({ ripple: null }, hold);
  };
  const shake = () => {
    for (const dx of SHAKE) push({ shake: dx }, 40);
  };

  push({}, D(500));
  o.clicks.forEach((R, i) => {
    const pt = {
      x: R.x + R.width * (0.38 + hashUnit(i, 11) * 0.24),
      y: R.y + R.height * (0.4 + hashUnit(i, 29) * 0.22),
    };
    move(pt);
    click(pt, { n: i + 1 }, D(o.cursor ? 90 : 140));
  });
  push({}, D(380));

  const v = o.verify;
  phase = 'verify';
  if (v) {
    const pt = { x: v.x + v.width * 0.55, y: v.y + v.height * 0.55 };
    move(pt);
    if (o.cursor) {
      push({ cursor: { ...pt, down: true }, press: true, ripple: { ...pt, r: 7, a: 0.55 } }, 90);
      push({ cursor: { ...pt, down: false }, press: false, ripple: { ...pt, r: 18, a: 0.2 } }, 60);
      push({ ripple: null }, D(260));
    } else {
      push({ press: true }, D(130));
      push({ press: false }, D(260));
    }
  }

  phase = 'ending';
  switch (o.ending) {
    case 'pass':
    case 'fail': {
      push({ robot: { a: 0, sc: 0.84 } }, 40);
      push({ robot: { a: 0.6, sc: 0.95 } }, 50);
      push({ robot: { a: 1, sc: 1 } }, D(320));
      if (o.cursor) {
        const c = o.robot.check;
        const pt = { x: c.x + c.width * 0.55, y: c.y + c.width * 0.6 };
        move(pt);
        click(pt, {}, D(120));
      }
      for (let i = 0; i < 12; i++) push({ robot: { a: 1, sc: 1, spin: i * 0.62 } }, 70);
      push({ robot: { a: 1, sc: 1, result: 0.5 } }, 80);
      if (o.ending === 'pass') push({ robot: { a: 1, sc: 1, result: 1 } }, D(2300));
      else {
        push({ robot: { a: 1, sc: 1, result: 1 } }, D(260));
        shake();
        push({}, D(2000));
      }
      break;
    }
    case 'error':
      for (const a of [0.35, 0.7, 1]) push({ err: a }, 50);
      shake();
      push({}, D(900));
      for (const a of [0.6, 0.25]) push({ selAlpha: a }, 70);
      push({ n: 0, selAlpha: 1 }, D(2000));
      break;
    case 'popup': {
      for (const a of [0.12, 0.26, 0.4]) push({ dim: a }, 45);
      push({ pop: { a: 0.4, sc: 0.86, press: false } }, 45);
      push({ pop: { a: 1, sc: 1.03, press: false } }, 50);
      push({ pop: { a: 1, sc: 1, press: false } }, D(900));
      if (o.cursor && o.popButton) {
        const B = o.popButton;
        const pt = { x: B.x + B.width * 0.56, y: B.y + B.height * 0.6 };
        move(pt);
        push(
          {
            cursor: { ...pt, down: true },
            pop: { a: 1, sc: 1, press: true },
            ripple: { ...pt, r: 7, a: 0.55 },
          },
          100,
        );
        push(
          {
            cursor: { ...pt, down: false },
            pop: { a: 1, sc: 1, press: false },
            ripple: { ...pt, r: 18, a: 0.2 },
          },
          60,
        );
        push({ ripple: null }, D(2300));
      } else push({}, D(2600));
      break;
    }
  }
  return T;
}

/** 依狀態與版面組出影格表的輸入 */
export function timelineInput(d: CaptchaState, L: CardLayout, measure: Measure): TimelineInput {
  const order = clickOrder(d);
  return {
    W: L.width,
    H: L.height,
    clicks: order.map((i) => L.cells[i]),
    verify: L.verify,
    ending: d.ending,
    cursor: d.cursor,
    k: SPEED_FACTOR[d.speed],
    robot: robotLayout(L.width, L.height),
    popButton:
      d.ending === 'popup' ? popupLayout(L.width, L.height, d.popup, measure).button : null,
  };
}

const PHASE_LABEL: Record<Phase, string> = { clicks: '點選', verify: '驗證', ending: '結尾' };

/** 播放列的分段：點選（含開頭的停留）、驗證、結尾 */
export function timelineSegments(frames: readonly AnimFrame[]): TimelineSegment[] {
  const out: TimelineSegment[] = [];
  let t = 0;
  for (const f of frames) {
    const last = out[out.length - 1];
    const end = t + f.ms / 1000;
    if (last && last.id === f.phase) last.end = end;
    else out.push({ id: f.phase, label: PHASE_LABEL[f.phase], start: t, end });
    t = end;
  }
  return out;
}

/* ---------- 畫法 ---------- */

export const MARK = {
  pass: '#1e9e5a',
  fail: '#d6362b',
  err: '#d6362b',
} as const;

export const POP_COLORS: Record<PopIcon, string> = {
  error: '#e04f4f',
  warn: '#f0a020',
  info: '#3d82f0',
  ok: '#22a35f',
};

const rgba = (hex: string, a: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** 目前的像素倍率（陰影的模糊與位移以像素計，不跟著縮放） */
const pixelScale = (ctx: Ctx): number => {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
};

/** 小記號：叉、勾、驚嘆號、i */
export function drawGlyph(
  ctx: Ctx,
  type: PopIcon,
  cx: number,
  cy: number,
  sz: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = sz * 0.13;
  ctx.beginPath();
  if (type === 'error') {
    const d = sz * 0.24;
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
    ctx.stroke();
  } else if (type === 'ok') {
    ctx.moveTo(cx - sz * 0.26, cy + sz * 0.01);
    ctx.lineTo(cx - sz * 0.06, cy + sz * 0.21);
    ctx.lineTo(cx + sz * 0.28, cy - sz * 0.19);
    ctx.stroke();
  } else if (type === 'warn') {
    ctx.moveTo(cx, cy - sz * 0.26);
    ctx.lineTo(cx, cy + sz * 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + sz * 0.25, sz * 0.075, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(cx, cy - sz * 0.04);
    ctx.lineTo(cx, cy + sz * 0.27);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - sz * 0.25, sz * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 游標：白邊的黑色箭頭（按下時小一點） */
const CURSOR_SHAPE: readonly [number, number][] = [
  [0, 0],
  [0, 17.5],
  [4.5, 13.3],
  [7.5, 20.2],
  [10.4, 18.9],
  [7.4, 12.2],
  [13, 12.2],
];

export function drawCursor(ctx: Ctx, c: Point & { down: boolean }): void {
  const S = pixelScale(ctx);
  ctx.save();
  ctx.translate(c.x, c.y);
  const k = c.down ? 1 : 1.12;
  ctx.scale(k, k);
  ctx.beginPath();
  CURSOR_SHAPE.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 1.5 * S;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#16161a';
  ctx.fill();
  ctx.restore();
}

/** 盾牌＋勾（小視窗右邊的圖示，本站自己畫的） */
function shieldIcon(ctx: Ctx, cx: number, top: number, size: number) {
  const k = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * k, top);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(20, 5.2);
  ctx.bezierCurveTo(20, 13, 17, 18.6, 12, 22);
  ctx.bezierCurveTo(7, 18.6, 4, 13, 4, 5.2);
  ctx.closePath();
  ctx.fillStyle = '#4f6bd8';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(8.4, 12);
  ctx.lineTo(11, 14.6);
  ctx.lineTo(15.8, 9.4);
  ctx.stroke();
  ctx.restore();
}

function drawRobot(
  ctx: Ctx,
  s: NonNullable<FrameState['robot']>,
  d: CaptchaState,
  W: number,
  H: number,
) {
  const S = pixelScale(ctx);
  const { box: B, check } = robotLayout(W, H);
  ctx.save();
  ctx.globalAlpha = s.a;
  const cx = B.x + B.width / 2;
  const cy = B.y + B.height / 2;
  ctx.translate(cx, cy);
  ctx.scale(s.sc, s.sc);
  ctx.translate(-cx, -cy);
  /* 外框＋陰影 */
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 22 * S;
  ctx.shadowOffsetY = 8 * S;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  roundRectPath(ctx, B.x, B.y, B.width, B.height, ROBOT.radius);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#d9dce2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRectPath(ctx, B.x + 0.5, B.y + 0.5, B.width - 1, B.height - 1, ROBOT.radius - 0.5);
  ctx.stroke();
  /* 勾選框 */
  ctx.strokeStyle = '#c4c8cf';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  roundRectPath(ctx, check.x + 1, check.y + 1, check.width - 2, check.height - 2, 3);
  ctx.fill();
  ctx.stroke();
  /* 文字 */
  const brandW = 60;
  ctx.fillStyle = '#3c4043';
  ctx.font = font(ROBOT.label, 400);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const labelMax = B.width - ROBOT.labelX - brandW - 8;
  ctx.fillText(
    ellipsize(d.checkLabel, labelMax, (t) => ctx.measureText(t).width),
    B.x + ROBOT.labelX,
    cy + 0.5,
  );
  /* 右邊的圖示與說明 */
  const bx = B.x + B.width - 14 - brandW / 2;
  shieldIcon(ctx, bx, B.y + 13, 30);
  ctx.fillStyle = '#8a9099';
  ctx.font = font(10, 500);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('安全驗證', bx, B.y + 47);
  ctx.restore();

  if (s.spin === undefined && s.result === undefined) return;
  const bw = check.width;
  const p = bw * 0.22;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(check.x - p, check.y - p, bw + 2 * p, bw + 2 * p);
  const mx = check.x + bw / 2;
  const my = check.y + bw / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.spin !== undefined) {
    ctx.strokeStyle = d.theme;
    ctx.lineWidth = bw * 0.13;
    ctx.beginPath();
    ctx.arc(mx, my, bw * 0.34, s.spin, s.spin + Math.PI * 1.45);
    ctx.stroke();
  } else if (s.result !== undefined) {
    const size = bw * s.result;
    const r = size / 2;
    if (d.ending === 'pass') {
      ctx.strokeStyle = MARK.pass;
      ctx.lineWidth = size * 0.17;
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.55, my + r * 0.06);
      ctx.lineTo(mx - r * 0.12, my + r * 0.5);
      ctx.lineTo(mx + r * 0.62, my - r * 0.46);
      ctx.stroke();
    } else {
      const q = r * 0.62;
      ctx.strokeStyle = MARK.fail;
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      ctx.moveTo(mx - q, my - q);
      ctx.lineTo(mx + q, my + q);
      ctx.moveTo(mx + q, my - q);
      ctx.lineTo(mx - q, my + q);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 錯誤文字：圖片格下方浮出的白色橫條（左邊紅色條、紅色驚嘆號、紅字） */
function drawError(ctx: Ctx, a: number, text: string, grid: Rect) {
  const S = pixelScale(ctx);
  const h = 38;
  const x = grid.x + 8;
  const w = grid.width - 16;
  const y = grid.y + grid.height - h - 8 + (1 - a) * 8;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 14 * S;
  ctx.shadowOffsetY = 4 * S;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, 9);
  ctx.clip();
  ctx.fillStyle = MARK.err;
  ctx.fillRect(x, y, 4, h);
  ctx.restore();
  ctx.fillStyle = MARK.err;
  ctx.beginPath();
  ctx.arc(x + 22, y + h / 2, 8.5, 0, Math.PI * 2);
  ctx.fill();
  drawGlyph(ctx, 'warn', x + 22, y + h / 2 + 1, 17, '#ffffff');
  ctx.fillStyle = MARK.err;
  ctx.font = font(13, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    ellipsize(text, w - 46, (t) => ctx.measureText(t).width),
    x + 38,
    y + h / 2 + 1,
  );
  ctx.restore();
}

function drawPopup(ctx: Ctx, s: NonNullable<FrameState['pop']>, d: CaptchaState, P: PopupLayout) {
  const S = pixelScale(ctx);
  const B = P.box;
  const color = d.theme;
  const textColor = themeTextColor(d.theme);
  const L = POPUP;
  const cx = B.x + B.width / 2;
  const cy = B.y + B.height / 2;
  ctx.save();
  ctx.globalAlpha = s.a;
  ctx.translate(cx, cy);
  ctx.scale(s.sc, s.sc);
  ctx.translate(-cx, -cy);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 30 * S;
  ctx.shadowOffsetY = 12 * S;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  roundRectPath(ctx, B.x, B.y, B.width, B.height, 6);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, B.x, B.y, B.width, B.height, 6);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(B.x, B.y, B.width, L.head);
  ctx.fillStyle = '#f0f1f4';
  ctx.fillRect(B.x, B.y + L.head + P.bodyH, B.width, 1);
  ctx.restore();
  /* 標題與關閉的叉 */
  ctx.fillStyle = textColor;
  ctx.font = font(L.title.size, L.title.weight);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    ellipsize(d.popup.title, B.width - L.pad - 44, (t) => ctx.measureText(t).width),
    B.x + L.pad,
    B.y + L.head / 2 + 1,
  );
  const xx = B.x + B.width - 22;
  const xy = B.y + L.head / 2;
  ctx.save();
  ctx.globalAlpha *= 0.75;
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xx - 5, xy - 5);
  ctx.lineTo(xx + 5, xy + 5);
  ctx.moveTo(xx + 5, xy - 5);
  ctx.lineTo(xx - 5, xy + 5);
  ctx.stroke();
  ctx.restore();
  /* 圖示與內容 */
  const by = B.y + L.head + 18;
  const ic = POP_COLORS[d.popup.icon];
  ctx.fillStyle = rgba(ic, 0.13);
  ctx.beginPath();
  ctx.arc(B.x + L.pad + L.icon / 2, by + L.icon / 2, L.icon / 2, 0, Math.PI * 2);
  ctx.fill();
  drawGlyph(ctx, d.popup.icon, B.x + L.pad + L.icon / 2, by + L.icon / 2, 21, ic);
  ctx.fillStyle = '#3c4043';
  ctx.font = font(L.msg.size, L.msg.weight);
  ctx.textBaseline = 'top';
  const tH = P.lines.length * L.line;
  const ty = by + Math.max(0, (L.icon - tH) / 2);
  P.lines.forEach((ln, i) => {
    ctx.fillText(ln, B.x + P.textX, ty + i * L.line + 2);
  });
  /* 按鈕 */
  const btn = P.button;
  ctx.fillStyle = color;
  ctx.beginPath();
  roundRectPath(ctx, btn.x, btn.y, btn.width, btn.height, 4);
  ctx.fill();
  if (s.press) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fill();
  }
  ctx.fillStyle = textColor;
  ctx.font = font(L.button.size, L.button.weight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.popup.button, btn.x + btn.width / 2, btn.y + btn.height / 2 + 1);
  ctx.restore();
}

/** 一格的畫面（底圖之上的東西；底圖由呼叫端先畫好、已經套用搖晃的位移） */
export function drawOverlay(
  ctx: Ctx,
  s: FrameState,
  d: CaptchaState,
  L: CardLayout,
  order: readonly number[],
  popup: PopupLayout | null,
): void {
  if (s.n) {
    ctx.save();
    ctx.globalAlpha = s.selAlpha;
    for (let i = 0; i < s.n && i < order.length; i++)
      drawSelection(ctx, L.cells[order[i]], d.theme);
    ctx.restore();
  }
  if (s.press && L.verify) {
    const v = L.verify;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    roundRectPath(ctx, v.x, v.y, v.width, v.height, 4);
    ctx.fill();
  }
  if (s.err) drawError(ctx, s.err, d.errorText, L.grid);
  if (s.robot) drawRobot(ctx, s.robot, d, L.width, L.height);
  if (s.dim) {
    ctx.fillStyle = `rgba(16, 16, 22, ${s.dim})`;
    ctx.fillRect(-20, 0, L.width + 40, L.height);
  }
  if (s.pop && popup) drawPopup(ctx, s.pop, d, popup);
  if (s.ripple) {
    const q = s.ripple;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(d.theme, q.a);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(d.theme, Math.min(1, q.a * 1.6));
    ctx.stroke();
  }
  if (s.cursor) drawCursor(ctx, s.cursor);
}

/* ---------- 動畫來源 ---------- */

export interface CaptchaSource extends AnimationSource {
  frames: FrameSpec[];
  anim: AnimFrame[];
  layout: CardLayout;
  /** 點選順序（格子的位置） */
  order: number[];
  /** 畫第 i 格（卡片單位；ctx 已經 scale） */
  drawIndex(ctx: Ctx, i: number): void;
}

/**
 * 動畫來源：底圖（沒有勾選的卡片）以 pixelScale 倍畫好快取；render(ctx, t) 畫 t 秒時的那一格。
 * 匯出時 pixelScale 要等於 exportAnimation 的 scale（底圖 1：1 貼上）。
 */
let probeCtx: Ctx | null = null;
const probe = (): Ctx => {
  if (!probeCtx) probeCtx = makeCanvas(1, 1).getContext('2d') as Ctx;
  return probeCtx;
};

/** 只算版面與影格表（不畫底圖；匯出區的預估、測試入口用） */
export function captchaTimeline(d: CaptchaState): {
  layout: CardLayout;
  frames: AnimFrame[];
  popup: PopupLayout | null;
} {
  const ctx = probe();
  const measure = canvasMeasure(ctx);
  const L = layoutFor(ctx, d);
  return {
    layout: L,
    frames: buildTimeline(timelineInput(d, L, measure)),
    popup: d.ending === 'popup' ? popupLayout(L.width, L.height, d.popup, measure) : null,
  };
}

export function createCaptchaSource(
  d: CaptchaState,
  resolve: ImageResolver,
  pixelScale: number,
): CaptchaSource {
  const { layout: L, frames: anim, popup } = captchaTimeline(d);
  const base: AnyCanvas = makeCanvas(
    Math.round(L.width * pixelScale),
    Math.round(L.height * pixelScale),
  );
  const bctx = base.getContext('2d') as Ctx;
  bctx.setTransform(base.width / L.width, 0, 0, base.height / L.height, 0, 0);
  drawCard(bctx, d, L, resolve, { selections: false });
  const order = clickOrder(d);
  const frames: FrameSpec[] = anim.map((f) => ({ ms: f.ms }));
  const drawIndex = (ctx: Ctx, i: number) => {
    const f = anim[Math.max(0, Math.min(anim.length - 1, i))];
    if (!f) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, L.width, L.height);
    ctx.translate(f.s.shake, 0);
    ctx.drawImage(base, 0, 0, L.width, L.height);
    drawOverlay(ctx, f.s, d, L, order, popup);
    ctx.restore();
  };
  return {
    width: L.width,
    height: L.height,
    duration: frameTableDuration(frames),
    frames,
    anim,
    layout: L,
    order,
    stillTime: 0,
    segments: timelineSegments(anim),
    render: (ctx, t) => drawIndex(ctx as Ctx, frameIndexAt(frames, t)),
    drawIndex,
  };
}
