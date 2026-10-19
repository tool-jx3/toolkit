/**
 * 票券範本（電影票、登機證、台鐵風格車票、高鐵風格車票、收據）：每一款的高度與畫法。
 * 座標是票券單位（CSS px），原點在票的左上角；票的外形（圓角、打孔的半圓缺口、收據的鋸齒邊）在這裡決定，
 * 缺口與鋸齒外是透明的（墊紙或棋盤格從那裡露出來）。配色由主色、輔色算出來；版面、文案都是本站自己做的。
 */
import { roundRectPath } from '@/core/image';
import { alpha, mix, onColor } from '../colors';
import {
  barcode,
  circle,
  type DrawEnv,
  field,
  fillRRect,
  firstChar,
  fontString,
  line,
  measure,
  photo,
  qr,
  region,
  strokeRRect,
  text,
} from '../kit';
import type { ReceiptItem } from '../model';
import type { TicketTemplate, TicketTemplateId } from '../templates';

export interface TicketPalette {
  c1: string;
  c2: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  soft1: string;
  soft2: string;
  accentLine: string;
  deep: string;
  mat: string;
}

/** 主色、輔色 → 票券的配色 */
export function ticketPalette(c1: string, c2: string): TicketPalette {
  return {
    c1,
    c2,
    paper: '#fffdf8',
    ink: '#2a2622',
    muted: '#9b948b',
    line: '#ebe4da',
    soft1: mix(c1, '#fffdf8', 0.72),
    soft2: mix(c2, '#fffdf8', 0.35),
    accentLine: mix(c1, '#ebe4da', 0.5),
    deep: mix(c1, '#3a332e', 0.55),
    mat: mix(c2, '#f2ece4', 0.62),
  };
}

export interface TicketEnv extends DrawEnv {
  tpl: TicketTemplate;
  p: TicketPalette;
  /** 票上畫的欄位名稱 */
  caption: (key: string) => string;
  /** 編號（條碼、QR code 預設的內容） */
  code: string;
  qrContent: string;
  items: readonly ReceiptItem[];
  totals: { subtotal: number; discount: number; total: number };
  receiptPhoto: boolean;
  fmt: (n: number) => string;
}

/** 135° 的漸層（左上 → 右下） */
function grad(e: TicketEnv, x: number, y: number, w: number, h: number, a: string, b: string) {
  const g = e.ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

/** 小標（等寬、字距寬、次要色） */
function lbl(
  e: TicketEnv,
  key: string,
  x: number,
  y: number,
  o: { align?: 'left' | 'right' | 'center'; size?: number; color?: string } = {},
) {
  const t = e.caption(key);
  if (!t) return;
  const size = o.size ?? 7;
  text(e, t, x, y, {
    font: 'mono',
    size,
    weight: 500,
    color: o.color ?? e.p.muted,
    spacing: size * 0.2,
    upper: true,
    align: o.align,
  });
  region(e, {
    kind: 'field',
    key: `caption:${key}`,
    x: o.align === 'right' ? x - 60 : o.align === 'center' ? x - 30 : x,
    y: y - size - 2,
    w: 60,
    h: size + 4,
  });
}

/** 票身：圓角矩形，減掉打孔的半圓缺口；之後畫的東西都裁在票身裡 */
function body(
  e: TicketEnv,
  w: number,
  h: number,
  r: number,
  notches: readonly [number, number][],
  nr = 11,
) {
  const { ctx } = e;
  const outline = new Path2D();
  roundRectPath(outline, 0, 0, w, h, r);
  const holes = new Path2D();
  roundRectPath(holes, 0, 0, w, h, r);
  for (const [x, y] of notches) {
    holes.moveTo(x + nr, y);
    holes.arc(x, y, nr, 0, Math.PI * 2);
  }
  ctx.save();
  ctx.clip(outline);
  ctx.clip(holes, 'evenodd');
  ctx.fillStyle = e.p.paper;
  ctx.fillRect(0, 0, w, h);
}

/** 票身的細外框（畫在最後） */
function hairline(e: TicketEnv, w: number, h: number, r: number) {
  e.ctx.restore();
  strokeRRect(e.ctx, 0.5, 0.5, w - 1, h - 1, r, 'rgba(60,40,30,0.08)', 1);
}

/** 打孔線（虛線） */
function perf(e: TicketEnv, x1: number, y1: number, x2: number, y2: number) {
  line(e.ctx, x1, y1, x2, y2, e.p.accentLine, 1.5, [5, 4]);
}

/** 小飛機（機頭朝右；24 單位的方框裡） */
function plane(e: TicketEnv, cx: number, cy: number, size: number, color: string, angle = 0) {
  const { ctx } = e;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(size / 24, size / 24);
  ctx.beginPath();
  ctx.moveTo(11, -1.4);
  ctx.lineTo(11, 1.4);
  ctx.lineTo(-1, 1.6);
  ctx.lineTo(-6, 9);
  ctx.lineTo(-8.5, 9);
  ctx.lineTo(-5, 1.6);
  ctx.lineTo(-9, 1.4);
  ctx.lineTo(-11, 4);
  ctx.lineTo(-12.5, 4);
  ctx.lineTo(-11.4, 0);
  ctx.lineTo(-12.5, -4);
  ctx.lineTo(-11, -4);
  ctx.lineTo(-9, -1.4);
  ctx.lineTo(-5, -1.6);
  ctx.lineTo(-8.5, -9);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-1, -1.6);
  ctx.closePath();
  ctx.arc(11, 0, 1.4, -Math.PI / 2, Math.PI / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 空的照片格（漸層＋預覽上的「＋照片」） */
function photoSlot(e: TicketEnv, x: number, y: number, w: number, h: number, radius: number) {
  photo(e, x, y, w, h, {
    radius,
    bg: grad(e, x, y, w, h, e.p.c1, e.p.c2),
    emptyText: { text: '＋ 照片', color: 'rgba(60,40,30,0.4)', size: 9 },
  });
}

/* ======================================================================
 * 電影票（寬 346）
 * ==================================================================== */

const MV = { W: 346, H: 740, PERF: 662 } as const;

function movie(e: TicketEnv) {
  const { ctx, p } = e;
  const { W, H } = MV;
  body(e, W, H, 20, [
    [0, MV.PERF],
    [W, MV.PERF],
  ]);
  field(e, 'mv_cinema', 22, 31, {
    font: 'mono',
    size: 8.5,
    weight: 500,
    color: p.muted,
    spacing: 2,
    maxWidth: 160,
  });
  field(e, 'mv_no', W - 22, 31, {
    font: 'mono',
    size: 8.5,
    weight: 500,
    color: p.muted,
    spacing: 2,
    align: 'right',
    maxWidth: 140,
  });
  /* 底片框 */
  const fx = 14;
  const fy = 44;
  const fw = W - 28;
  const fh = 380;
  fillRRect(ctx, fx, fy, fw, fh, 12, '#211c19');
  ctx.fillStyle = alpha('#f3ece2', 0.88);
  for (let y = fy + 12; y < fy + fh - 12; y += 12) {
    ctx.fillRect(fx + 7, y, 7, 6);
    ctx.fillRect(fx + fw - 14, y, 7, 6);
  }
  photoSlot(e, 38, 60, 270, 337.5, 3);
  /* 照片四周的暗角 */
  if (e.photo) {
    const v = ctx.createRadialGradient(173, 225, 110, 173, 228, 230);
    v.addColorStop(0, 'rgba(40,20,10,0)');
    v.addColorStop(1, 'rgba(40,20,10,0.2)');
    ctx.save();
    ctx.beginPath();
    ctx.rect(38, 60, 270, 337.5);
    ctx.clip();
    ctx.fillStyle = v;
    ctx.fillRect(38, 60, 270, 337.5);
    ctx.restore();
  }
  text(e, '▸ 24', 38, 413, { font: 'mono', size: 7, color: p.c1, spacing: 1.5 });
  field(e, 'mv_film', W / 2, 413, {
    font: 'mono',
    size: 7,
    color: p.c1,
    spacing: 1.5,
    align: 'center',
    maxWidth: 180,
    upper: true,
  });
  text(e, '24A', 308, 413, { font: 'mono', size: 7, color: p.c1, spacing: 1.5, align: 'right' });
  /* 片名 */
  field(e, 'mv_kicker', 22, 460, {
    font: 'display',
    size: 15,
    color: p.deep,
    italic: true,
    maxWidth: 220,
  });
  field(e, 'mv_title', 22, 500, {
    font: 'display',
    size: 34,
    weight: 700,
    color: p.ink,
    maxWidth: 222,
    shrink: 0.55,
  });
  field(e, 'mv_sub', 22, 524, { size: 11.5, color: p.muted, maxWidth: 222 });
  /* 入場人數的章 */
  ctx.save();
  ctx.translate(286, 480);
  ctx.rotate((-10 * Math.PI) / 180);
  circle(ctx, 0, 0, 33);
  ctx.strokeStyle = p.deep;
  ctx.lineWidth = 1;
  ctx.stroke();
  text(e, 'ADMIT', 0, -15, {
    font: 'mono',
    size: 5.5,
    color: p.deep,
    align: 'center',
    spacing: 1.2,
  });
  field(e, 'mv_count', 0, 10, {
    font: 'display',
    size: 25,
    color: p.deep,
    align: 'center',
    maxWidth: 46,
  });
  lbl(e, 'mv_count', 0, 23, { align: 'center', size: 6, color: p.deep });
  ctx.restore();
  /* 場次表 */
  const gx = 22;
  const gy = 544;
  const gw = W - 44;
  const cw = gw / 3;
  line(ctx, gx, gy, gx + gw, gy, p.ink, 1);
  line(ctx, gx, gy + 46, gx + gw, gy + 46, p.line, 1);
  line(ctx, gx + cw, gy, gx + cw, gy + 92, p.line, 1);
  line(ctx, gx + cw * 2, gy, gx + cw * 2, gy + 92, p.line, 1);
  const cells = ['mv_date', 'mv_time', 'mv_hall', 'mv_row', 'mv_seat', 'mv_price'];
  cells.forEach((k, i) => {
    const x = gx + (i % 3) * cw + (i % 3 ? 11 : 0);
    const y = gy + Math.floor(i / 3) * 46;
    lbl(e, k, x, y + 16);
    field(e, k, x, y + 36, { size: 13, weight: 500, color: p.ink, maxWidth: cw - 14 });
  });
  /* 票根 */
  perf(e, 0, MV.PERF, W, MV.PERF);
  lbl(e, 'mv_guest', 22, 692);
  circle(ctx, 26, 709, 3.8);
  ctx.fillStyle = grad(e, 22, 705, 8, 8, p.c1, p.c2);
  ctx.fill();
  field(e, 'mv_guest', 36, 713.5, { size: 13, weight: 500, color: p.ink, maxWidth: 170 });
  ctx.save();
  ctx.globalAlpha = 0.85;
  barcode(e, e.code, 214, 680, 110, 28, p.ink, { key: 'mv_code', quiet: false });
  ctx.restore();
  field(e, 'mv_code', W - 22, 721, {
    font: 'mono',
    size: 6.5,
    color: p.muted,
    spacing: 1.6,
    align: 'right',
    maxWidth: 130,
  });
  hairline(e, W, H, 20);
}

/* ======================================================================
 * 登機證（800 × 370）
 * ==================================================================== */

const BP = { W: 800, H: 370, STUB: 588 } as const;

function boarding(e: TicketEnv) {
  const { ctx, p } = e;
  const { W, H, STUB } = BP;
  body(e, W, H, 20, [
    [STUB, 0],
    [STUB, H],
  ]);
  /* 票根的色帶 */
  ctx.fillStyle = grad(e, STUB, 0, W - STUB, 118, p.c1, p.c2);
  ctx.fillRect(STUB, 0, W - STUB, 118);
  /* 抬頭 */
  circle(ctx, 42, 44, 13);
  ctx.fillStyle = grad(e, 29, 31, 26, 26, p.c1, p.c2);
  ctx.fill();
  plane(e, 42, 44, 15, '#ffffff', -Math.PI / 4);
  field(e, 'bp_airline', 64, 49, {
    size: 12.5,
    weight: 700,
    color: p.ink,
    spacing: 3,
    maxWidth: 300,
    upper: true,
  });
  const cls = e.value('bp_class') || (e.preview ? e.label('bp_class') : '');
  ctx.font = fontString('mono', 9, 500);
  const cw = Math.min(160, measure(ctx, cls, 2) + 30);
  fillRRect(ctx, 560 - cw, 30, cw, 26, 13, grad(e, 560 - cw, 30, cw, 26, p.soft1, p.soft2));
  strokeRRect(ctx, 560 - cw, 30, cw, 26, 13, 'rgba(0,0,0,0.05)', 1);
  field(e, 'bp_class', 560 - cw / 2, 46.5, {
    font: 'mono',
    size: 9,
    weight: 500,
    color: p.ink,
    spacing: 2,
    align: 'center',
    maxWidth: cw - 16,
    upper: true,
  });
  line(ctx, 28, 74, 560, 74, p.line, 1);
  /* 照片 */
  photoSlot(e, 28, 94, 124, 166, 12);
  /* 航線 */
  field(e, 'bp_from', 172, 150, {
    size: 46,
    weight: 300,
    color: p.ink,
    spacing: -1,
    maxWidth: 130,
    upper: true,
  });
  field(e, 'bp_fromCity', 174, 172, {
    font: 'mono',
    size: 8.5,
    weight: 500,
    color: p.muted,
    spacing: 2,
    maxWidth: 120,
    upper: true,
  });
  field(e, 'bp_to', 560, 150, {
    size: 46,
    weight: 300,
    color: p.ink,
    spacing: -1,
    align: 'right',
    maxWidth: 130,
    upper: true,
  });
  field(e, 'bp_toCity', 558, 172, {
    font: 'mono',
    size: 8.5,
    weight: 500,
    color: p.muted,
    spacing: 2,
    align: 'right',
    maxWidth: 120,
    upper: true,
  });
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(318, 140);
  ctx.quadraticCurveTo(366, 94, 414, 140);
  ctx.strokeStyle = alpha(p.ink, 0.38);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 3.2]);
  ctx.stroke();
  ctx.restore();
  circle(ctx, 318, 140, 2.6);
  ctx.fillStyle = p.paper;
  ctx.fill();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  circle(ctx, 414, 140, 2.6);
  ctx.fillStyle = p.ink;
  ctx.fill();
  plane(e, 366, 117, 16, p.ink);
  field(e, 'bp_duration', 366, 162, {
    font: 'mono',
    size: 7.5,
    weight: 500,
    color: p.muted,
    spacing: 1.5,
    align: 'center',
    maxWidth: 170,
    upper: true,
  });
  line(ctx, 172, 192, 560, 192, p.line, 1);
  /* 旅客與航班 */
  lbl(e, 'bp_pax', 172, 214, { size: 7.5 });
  field(e, 'bp_pax', 172, 244, {
    font: 'display',
    size: 25,
    color: p.ink,
    maxWidth: 388,
    shrink: 0.6,
  });
  const grid = ['bp_flight', 'bp_date', 'bp_boards', 'bp_gate', 'bp_seat', 'bp_group'];
  grid.forEach((k, i) => {
    const x = 172 + (i % 3) * 132;
    const y = 270 + Math.floor(i / 3) * 40;
    lbl(e, k, x, y, { size: 7.5 });
    field(e, k, x, y + 19, { size: 13, weight: 500, color: p.ink, maxWidth: 124 });
  });
  line(ctx, 28, 342, 560, 342, p.line, 1, [3, 3]);
  field(e, 'bp_seq', 28, 359, {
    font: 'mono',
    size: 7,
    color: '#b5aea5',
    spacing: 1.8,
    maxWidth: 250,
    upper: true,
  });
  field(e, 'bp_note', 560, 359, {
    size: 7.5,
    color: '#b5aea5',
    spacing: 1.2,
    align: 'right',
    maxWidth: 260,
  });
  /* 票根 */
  perf(e, STUB, 0, STUB, H);
  text(e, '登機證 BOARDING PASS', STUB + 24, 42, {
    font: 'mono',
    size: 7.5,
    weight: 500,
    color: 'rgba(0,0,0,0.5)',
    spacing: 1.8,
  });
  const from = e.value('bp_from');
  const to = e.value('bp_to');
  const route = `${from || (e.preview ? '—' : '')} → ${to || (e.preview ? '—' : '')}`;
  text(e, route.toUpperCase(), STUB + 24, 74, {
    size: 18,
    weight: 500,
    color: p.ink,
    spacing: 1,
    maxWidth: 170,
  });
  region(e, { kind: 'field', key: 'bp_from', x: STUB + 24, y: 56, w: 170, h: 24 });
  lbl(e, 'bp_seat', STUB + 24, 148, { size: 7.5 });
  field(e, 'bp_seat', STUB + 22, 200, {
    size: 54,
    weight: 300,
    color: p.ink,
    spacing: -2,
    maxWidth: 170,
  });
  line(ctx, STUB + 24, 222, W - 24, 222, p.line, 1);
  lbl(e, 'bp_gate', STUB + 24, 244, { size: 7.5 });
  field(e, 'bp_gate', STUB + 24, 265, { size: 13, weight: 500, color: p.ink, maxWidth: 80 });
  lbl(e, 'bp_boards', STUB + 112, 244, { size: 7.5 });
  field(e, 'bp_boards', STUB + 112, 265, { size: 13, weight: 500, color: p.ink, maxWidth: 76 });
  ctx.save();
  ctx.globalAlpha = 0.8;
  barcode(e, e.code, STUB + 24, 300, W - STUB - 48, 40, p.ink, { key: 'bp_seq', quiet: false });
  ctx.restore();
  hairline(e, W, H, 20);
}

/* ======================================================================
 * 台鐵風格車票（600 × 310）
 * ==================================================================== */

const RL = { W: 600, H: 310 } as const;

function rail(e: TicketEnv) {
  const { ctx, p } = e;
  const { W, H } = RL;
  body(e, W, H, 10, []);
  ctx.fillStyle = mix(p.c2, '#fffdf8', 0.45);
  ctx.fillRect(0, 0, W, H);
  /* 防偽的細紋 */
  ctx.save();
  ctx.strokeStyle = alpha(p.c1, 0.16);
  ctx.lineWidth = 0.6;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 3) {
      const y = 60 + k * 26 + Math.sin(x / 22 + k) * 7 + Math.sin(x / 61 + k * 2) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = p.c1;
  ctx.fillRect(0, 0, W, 7);
  ctx.fillRect(0, H - 7, W, 7);
  /* 抬頭 */
  /* 車頭的小圖示：車身、車窗、兩盞燈、鐵軌 */
  fillRRect(ctx, 26, 20, 20, 22, 6, p.ink);
  fillRRect(ctx, 29.5, 24, 13, 8, 2, mix(p.c2, '#fffdf8', 0.45));
  circle(ctx, 31, 37, 1.5);
  ctx.fillStyle = mix(p.c2, '#fffdf8', 0.45);
  ctx.fill();
  circle(ctx, 41, 37, 1.5);
  ctx.fill();
  line(ctx, 30, 43, 27, 48, p.ink, 1.4);
  line(ctx, 42, 43, 45, 48, p.ink, 1.4);
  field(e, 'rl_company', 54, 37, {
    size: 13.5,
    weight: 900,
    color: p.ink,
    spacing: 3,
    maxWidth: 220,
  });
  text(e, '車票 TICKET', 512, 36, {
    size: 9,
    weight: 700,
    color: p.deep,
    spacing: 1.5,
    align: 'right',
  });
  strokeRRect(ctx, 520, 21, 54, 22, 3, p.ink, 1.2);
  field(e, 'rl_kind', 547, 36.5, {
    size: 10.5,
    weight: 900,
    color: p.ink,
    align: 'center',
    maxWidth: 46,
  });
  line(ctx, 26, 54, W - 26, 54, alpha(p.ink, 0.45), 0.8);
  /* 起訖站 */
  field(e, 'rl_from', 36, 118, {
    font: 'serif',
    size: 44,
    weight: 900,
    color: p.ink,
    spacing: 6,
    maxWidth: 220,
    shrink: 0.6,
  });
  field(e, 'rl_fromEn', 38, 138, {
    font: 'mono',
    size: 9,
    weight: 500,
    color: p.muted,
    spacing: 1.5,
    maxWidth: 200,
    upper: true,
  });
  field(e, 'rl_to', W - 36, 118, {
    font: 'serif',
    size: 44,
    weight: 900,
    color: p.ink,
    spacing: 6,
    align: 'right',
    maxWidth: 220,
    shrink: 0.6,
  });
  field(e, 'rl_toEn', W - 38, 138, {
    font: 'mono',
    size: 9,
    weight: 500,
    color: p.muted,
    spacing: 1.5,
    align: 'right',
    maxWidth: 200,
    upper: true,
  });
  const ax = W / 2;
  line(ctx, ax - 34, 101, ax + 30, 101, p.ink, 2);
  ctx.beginPath();
  ctx.moveTo(ax + 34, 101);
  ctx.lineTo(ax + 22, 94);
  ctx.lineTo(ax + 22, 108);
  ctx.closePath();
  ctx.fillStyle = p.ink;
  ctx.fill();
  /* 車次表 */
  const cells: [string, number, string?][] = [
    ['rl_type', 100],
    ['rl_train', 84, ' 次'],
    ['rl_date', 136],
    ['rl_dep', 110],
    ['rl_arr', 118],
  ];
  let x = 26;
  const y = 158;
  fillRRect(ctx, 26, y, W - 52, 52, 4, alpha('#ffffff', 0.7));
  strokeRRect(ctx, 26, y, W - 52, 52, 4, alpha(p.ink, 0.55), 1);
  cells.forEach(([k, w, suffix], i) => {
    if (i) line(ctx, x, y, x, y + 52, alpha(p.ink, 0.3), 0.8);
    lbl(e, k, x + 10, y + 17, { color: p.deep });
    field(e, k, x + 10, y + 41, { size: 16, weight: 900, color: p.ink, maxWidth: w - 18, suffix });
    x += w;
  });
  /* 車廂座位、票價 */
  lbl(e, 'rl_car', 30, 236, { color: p.deep });
  field(e, 'rl_car', 30, 266, { size: 24, weight: 900, color: p.ink, maxWidth: 60, suffix: ' 車' });
  lbl(e, 'rl_seat', 104, 236, { color: p.deep });
  field(e, 'rl_seat', 104, 266, {
    size: 24,
    weight: 900,
    color: p.ink,
    maxWidth: 80,
    suffix: ' 號',
  });
  lbl(e, 'rl_fare', 210, 236, { color: p.deep });
  field(e, 'rl_fare', 210, 264, { size: 18, weight: 900, color: p.ink, maxWidth: 140 });
  field(e, 'rl_note', 30, 290, { size: 8, weight: 500, color: p.muted, spacing: 1, maxWidth: 300 });
  barcode(e, e.code, 382, 228, 192, 38, p.ink, { key: 'rl_no', quiet: false });
  field(e, 'rl_no', W - 26, 284, {
    font: 'mono',
    size: 8,
    color: p.ink,
    spacing: 1.5,
    align: 'right',
    maxWidth: 192,
  });
  hairline(e, W, H, 10);
}

/* ======================================================================
 * 高鐵風格車票（600 × 300）
 * ==================================================================== */

const HS = { W: 600, H: 300 } as const;

function hsr(e: TicketEnv) {
  const { ctx, p } = e;
  const { W, H } = HS;
  body(e, W, H, 12, []);
  /* 上方色帶 */
  ctx.fillStyle = grad(e, 0, 0, W, 58, p.c1, mix(p.c1, p.c2, 0.45));
  ctx.fillRect(0, 0, W, 58);
  const oc = onColor(p.c1);
  field(e, 'hsr_company', 26, 37, { size: 14, weight: 900, color: oc, spacing: 2, maxWidth: 300 });
  const kind = e.value('hsr_kind') || (e.preview ? e.label('hsr_kind') : '');
  ctx.font = fontString('sans', 10, 900);
  const kw = Math.max(48, measure(ctx, kind, 1) + 24);
  fillRRect(ctx, W - 26 - kw, 18, kw, 24, 12, '#ffffff');
  field(e, 'hsr_kind', W - 26 - kw / 2, 34.5, {
    size: 10,
    weight: 900,
    color: p.deep,
    align: 'center',
    spacing: 1,
    maxWidth: kw - 12,
  });
  text(e, '車票 TICKET', W - 36 - kw, 35, {
    size: 9,
    weight: 700,
    color: alpha(oc, 0.85),
    spacing: 1.5,
    align: 'right',
  });
  /* 時刻 */
  const blocks: [string, string, string, number][] = [
    ['hsr_dep', 'hsr_from', 'hsr_fromEn', 26],
    ['hsr_arr', 'hsr_to', 'hsr_toEn', 246],
  ];
  for (const [tk, sk, ek, x] of blocks) {
    field(e, tk, x, 126, { font: 'cond', size: 48, weight: 600, color: p.ink, maxWidth: 170 });
    field(e, sk, x + 2, 152, { size: 15, weight: 900, color: p.ink, spacing: 2, maxWidth: 170 });
    field(e, ek, x + 2, 168, {
      font: 'mono',
      size: 8,
      weight: 500,
      color: p.muted,
      spacing: 1.4,
      maxWidth: 170,
      upper: true,
    });
  }
  /* 箭頭 */
  for (let k = 0; k < 3; k++) {
    const ax = 182 + k * 14;
    ctx.beginPath();
    ctx.moveTo(ax, 96);
    ctx.lineTo(ax + 9, 106);
    ctx.lineTo(ax, 116);
    ctx.strokeStyle = alpha(p.c1, 0.45 + k * 0.25);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  /* QR code */
  strokeRRect(ctx, 471.5, 75.5, 103, 103, 6, p.line, 1);
  qr(e, e.qrContent, 472, 76, 102, { radius: 6, pad: 6, dark: p.ink });
  field(e, 'hsr_no', 523, 194, {
    font: 'mono',
    size: 7,
    color: p.muted,
    align: 'center',
    spacing: 0.6,
    maxWidth: 120,
  });
  /* 資訊列 */
  const cells: [string, number][] = [
    ['hsr_date', 104],
    ['hsr_train', 72],
    ['hsr_car', 60],
    ['hsr_seat', 66],
    ['hsr_class', 118],
  ];
  let x = 26;
  const y = 206;
  fillRRect(ctx, 26, y, 420, 50, 8, grad(e, 26, y, 420, 50, p.soft1, p.soft2));
  cells.forEach(([k, w], i) => {
    if (i) line(ctx, x, y + 10, x, y + 40, alpha(p.ink, 0.12), 1);
    lbl(e, k, x + 10, y + 18);
    field(e, k, x + 10, y + 40, { size: 14, weight: 900, color: p.ink, maxWidth: w - 16 });
    x += w;
  });
  lbl(e, 'hsr_fare', 472, y + 18);
  field(e, 'hsr_fare', 472, y + 42, { size: 18, weight: 900, color: p.deep, maxWidth: 104 });
  text(e, '本票限當日乘車有效・請保留至出站', 26, 282, { size: 7.5, color: p.muted, spacing: 1 });
  ctx.fillStyle = p.c1;
  ctx.fillRect(0, H - 6, W, 6);
  hairline(e, W, H, 12);
}

/* ======================================================================
 * 收據（寬 320、高度依品項與照片）
 * ==================================================================== */

const RC = { W: 320, EDGE: 7, TOOTH: 8, PHOTO_H: 268 / 1.5, ROW: 22 } as const;

export function receiptHeight(items: number, withPhoto: boolean): number {
  const top = withPhoto ? 240 + RC.PHOTO_H + 32 : 248;
  return Math.ceil(top + items * RC.ROW + 6 + 12 + 46 + 66 + 120);
}

function receipt(e: TicketEnv) {
  const { ctx, p } = e;
  const W = RC.W;
  const H = receiptHeight(e.items.length, e.receiptPhoto);
  /* 鋸齒邊 */
  const shape = new Path2D();
  const s = RC.TOOTH;
  const h = RC.EDGE;
  shape.moveTo(0, h);
  for (let x = 0; x < W; x += s) {
    shape.lineTo(x + s / 2, 0);
    shape.lineTo(Math.min(W, x + s), h);
  }
  shape.lineTo(W, H - h);
  for (let x = W; x > 0; x -= s) {
    shape.lineTo(x - s / 2, H);
    shape.lineTo(Math.max(0, x - s), H - h);
  }
  shape.closePath();
  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);
  const L = 26;
  const R = W - 26;
  /* 印章 */
  ctx.save();
  ctx.translate(266, 52);
  ctx.rotate((12 * Math.PI) / 180);
  circle(ctx, 0, 0, 28);
  ctx.strokeStyle = p.deep;
  ctx.lineWidth = 1;
  ctx.stroke();
  field(e, 'rc_stamp', 0, 1, {
    size: 11,
    weight: 900,
    color: p.deep,
    align: 'center',
    spacing: 1.5,
    maxWidth: 46,
  });
  text(e, 'THANK YOU', 0, 12, {
    font: 'mono',
    size: 5,
    color: p.deep,
    align: 'center',
    spacing: 1,
  });
  ctx.restore();
  /* 店名 */
  circle(ctx, W / 2, 46, 20);
  ctx.fillStyle = grad(e, W / 2 - 20, 26, 40, 40, p.c1, p.c2);
  ctx.fill();
  circle(ctx, W / 2, 46, 24.5);
  ctx.strokeStyle = p.accentLine;
  ctx.lineWidth = 1;
  ctx.stroke();
  text(e, firstChar(e.value('rc_store')), W / 2, 47, {
    font: 'display',
    size: 19,
    italic: true,
    color: p.ink,
    align: 'center',
    baseline: 'middle',
  });
  field(e, 'rc_store', W / 2, 100, {
    font: 'display',
    size: 26,
    weight: 700,
    color: p.ink,
    align: 'center',
    maxWidth: 230,
    shrink: 0.6,
  });
  field(e, 'rc_sub', W / 2, 118, {
    font: 'mono',
    size: 7.5,
    color: p.muted,
    align: 'center',
    spacing: 2.2,
    maxWidth: 260,
    upper: true,
  });
  const rule = (y: number) => line(ctx, L, y, R, y, '#ddd6cc', 1, [3, 3]);
  rule(134);
  const meta: [string, string][] = [
    ['rc_date', ''],
    ['rc_order', '#'],
    ['rc_client', ''],
    ['rc_server', ''],
  ];
  meta.forEach(([k, prefix], i) => {
    const y = 156 + i * 18;
    lbl(e, k, L, y, { size: 9 });
    field(e, k, R, y, {
      font: 'mono',
      size: 10.5,
      color: p.ink,
      align: 'right',
      maxWidth: 170,
      prefix,
    });
  });
  rule(226);
  let y = 248;
  if (e.receiptPhoto) {
    photoSlot(e, L, 240, R - L, RC.PHOTO_H, 6);
    y = 240 + RC.PHOTO_H + 16;
    rule(y);
    y += 16;
  }
  /* 品項 */
  e.items.forEach((it, i) => {
    const by = y + i * RC.ROW + 14;
    const name = it.name || (e.preview ? '品名' : '');
    const nw = text(e, name, L, by, {
      font: 'mono',
      size: 10.5,
      weight: 500,
      color: it.name ? p.ink : alpha(p.ink, 0.3),
      maxWidth: 140,
    }).width;
    const qw = text(e, `×${it.qty}`, L + nw + 6, by, {
      font: 'mono',
      size: 10.5,
      color: p.muted,
    }).width;
    const amount = e.fmt(it.qty * it.price);
    ctx.font = fontString('mono', 10.5, 400);
    const aw = measure(ctx, amount);
    line(ctx, L + nw + qw + 12, by - 3, R - aw - 7, by - 3, '#cdc5bb', 1, [1, 2]);
    text(e, amount, R, by, { font: 'mono', size: 10.5, color: p.ink, align: 'right' });
    region(e, { kind: 'field', key: `item:${it.id}`, x: L, y: by - 13, w: R - L, h: 18 });
  });
  y += e.items.length * RC.ROW + 6;
  line(ctx, L, y, R, y, '#d1c9be', 1);
  line(ctx, L, y + 3, R, y + 3, '#d1c9be', 1);
  y += 22;
  lbl(e, 'subtotal', L, y, { size: 9 });
  text(e, e.fmt(e.totals.subtotal), R, y, {
    font: 'mono',
    size: 10.5,
    color: p.ink,
    align: 'right',
  });
  y += 18;
  lbl(e, 'rc_discount', L, y, { size: 9 });
  const disc = e.totals.discount;
  text(e, disc ? `−${e.fmt(disc)}` : '0', R, y, {
    font: 'mono',
    size: 10.5,
    color: p.ink,
    align: 'right',
  });
  region(e, { kind: 'field', key: 'rc_discount', x: R - 100, y: y - 12, w: 100, h: 16 });
  y += 12;
  fillRRect(ctx, L, y, R - L, 48, 10, grad(e, L, y, R - L, 48, p.soft1, p.soft2));
  lbl(e, 'total', L + 14, y + 28, { size: 9.5, color: p.ink });
  const tw = text(e, e.fmt(e.totals.total), R - 14, y + 34, {
    font: 'display',
    size: 26,
    color: p.ink,
    align: 'right',
  }).width;
  field(e, 'rc_currency', R - 18 - tw, y + 33, {
    font: 'display',
    size: 14,
    color: p.deep,
    align: 'right',
    maxWidth: 40,
  });
  y += 48 + 24;
  ctx.save();
  ctx.globalAlpha = 0.78;
  barcode(e, e.code, W / 2 - 100, y, 200, 34, p.ink, { key: 'rc_code', quiet: false });
  ctx.restore();
  field(e, 'rc_code', W / 2, y + 48, {
    font: 'mono',
    size: 7.5,
    color: p.muted,
    align: 'center',
    spacing: 3,
    maxWidth: 260,
  });
  field(e, 'rc_msg', W / 2, y + 74, {
    font: 'display',
    size: 15,
    italic: true,
    color: p.deep,
    align: 'center',
    maxWidth: 260,
  });
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(60,40,30,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke(shape);
  ctx.restore();
}

/* ---------- 對外 ---------- */

export interface TicketDrawing {
  width: number;
  height: (env: { items: number; receiptPhoto: boolean }) => number;
  draw: (e: TicketEnv) => void;
}

export const TICKET_DRAWINGS: Record<TicketTemplateId, TicketDrawing> = {
  movie: { width: MV.W, height: () => MV.H, draw: movie },
  boarding: { width: BP.W, height: () => BP.H, draw: boarding },
  rail: { width: RL.W, height: () => RL.H, draw: rail },
  hsr: { width: HS.W, height: () => HS.H, draw: hsr },
  receipt: { width: RC.W, height: (x) => receiptHeight(x.items, x.receiptPhoto), draw: receipt },
};
