/**
 * 11 種主題的畫法（規格 3.3；版面、裝飾、配色的細節都是本站自己設計的，只照原作的元素：
 * 標題＋印章、附圖、本文的順序，各主題的特殊元素〔視窗按鈕、系統通知標頭、提示字元、手機外框與泡泡…〕）。
 *
 * 每個主題先決定外形（剪裁）、鋪底（背景色→質感→背景圖），再畫內容與框。座標是畫面 px。
 */
import { measureWidth } from '@/core/scene';
import { DECOR_SANS, DECOR_SERIF } from '../fonts';
import { bubbleLayout, newspaperColumns } from '../layout';
import { parseSms } from '../markup';
import type { ThemeId } from '../model';
import { S } from '../strings';
import {
  type Ctx,
  drawRows,
  ellipsize,
  fontOf,
  luminance,
  measurer,
  rgba,
  roundRectPath,
  rowHeight,
  type TextStyle,
} from './canvas';
import { backgroundLayer } from './images';
import type { Painter } from './painter';
import { drawStatusIcons } from './stamps';
import { paintTexture } from './textures';

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 鋪底：背景色 → 質感 → 背景圖（不透明度） */
function surface(p: Painter, r: Region): void {
  const { ctx, h, env } = p;
  ctx.save();
  ctx.fillStyle = rgba(h.bgColor);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.translate(r.x, r.y);
  paintTexture(ctx, h.texture, r.w, r.h, h.textColor);
  ctx.restore();
  if (env.bgImage && h.bg.image) {
    const layer = backgroundLayer(env.bgImage, h.bg.image.id, h.bg, r.w, r.h, env.scale, env.cache);
    ctx.save();
    ctx.globalAlpha = h.bg.opacity / 100;
    ctx.drawImage(layer, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

const whole = (p: Painter): Region => ({ x: 0, y: 0, w: p.W, h: p.H });

/** 細線（水平） */
function hline(ctx: Ctx, x: number, y: number, w: number, thick: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thick);
}

/* ---------- 基本 ---------- */

function basic(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  const pad = 36;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  const align = h.align;
  if (h.title.trim() || p.hasStamp) {
    const ts = p.titleStyle(26);
    y += p.headerRow(h.title, x, y, w, ts, align);
    if (h.title.trim()) {
      /* 標題下的短色條（跟著對齊） */
      const tw = p.hasStamp ? w - 52 : w;
      const bw = 44;
      const bx = align === 'center' ? x + (tw - bw) / 2 : align === 'right' ? x + tw - bw : x;
      y += 10;
      hline(ctx, bx, y, bw, 3, h.textColor);
      y += 3;
    }
    y += 22;
  }
  const ih = p.imageBlock(x, y, w);
  if (ih) y += ih + 20;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.9 }), align);
  ctx.strokeStyle = rgba(h.textColor, 0.85);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

/* ---------- 便條：上方的裝訂帶與打孔（孔是透明的） ---------- */

const MEMO_BAND = 26;

function memo(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  hline(ctx, 0, 0, W, MEMO_BAND, rgba(h.textColor, 0.07));
  hline(ctx, 0, MEMO_BAND, W, 1, rgba(h.textColor, 0.18));
  /* 打孔：挖空成透明 */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';
  const n = Math.max(1, Math.floor((W - 24) / 22));
  const start = (W - (n - 1) * 22) / 2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(start + i * 22, MEMO_BAND / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const pad = 32;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = MEMO_BAND + 24;
  if (h.title.trim() || p.hasStamp) {
    y += p.headerRow(h.title, x, y, w, p.titleStyle(22), h.align);
    y += 10;
    hline(ctx, x, y, w, 2, rgba(h.textColor, 0.8));
    y += 2 + 20;
  }
  const ih = p.imageBlock(x, y, w);
  if (ih) y += ih + 18;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.65 }), h.align);
  ctx.strokeStyle = h.textColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
}

/* ---------- 便利貼：右下角捲起 ---------- */

const CURL = 28;

function stickyShape(ctx: Ctx, W: number, H: number): void {
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H - CURL);
  ctx.quadraticCurveTo(W - CURL * 0.25, H - CURL * 0.2, W - CURL * 1.3, H);
  ctx.lineTo(0, H);
  ctx.closePath();
}

function sticky(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  shade.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.07)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const pad = 30;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  if (h.title.trim() || p.hasStamp) {
    y += p.headerRow(h.title, x, y, w, p.titleStyle(20), h.align);
    y += 16;
  }
  const ih = p.imageBlock(x, y, w);
  if (ih) y += ih + 16;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.65 }), h.align);
  /* 捲起的角：背面的顏色（暗一點）＋摺線的陰影 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W, H - CURL);
  ctx.quadraticCurveTo(W - CURL * 0.25, H - CURL * 0.2, W - CURL * 1.3, H);
  ctx.quadraticCurveTo(W - CURL * 0.75, H - CURL * 0.7, W, H - CURL);
  ctx.closePath();
  const g = ctx.createLinearGradient(W - CURL * 1.3, H, W, H - CURL);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
  g.addColorStop(0.55, 'rgba(255, 255, 255, 0.25)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
  ctx.fillStyle = rgba(h.bgColor);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/* ---------- 拍立得 ---------- */

function polaroid(p: Painter): void {
  const { ctx, W, H, h, env } = p;
  surface(p, whole(p));
  const side = 20;
  const x = side;
  const w = W - side * 2;
  const bottom = H - 56;
  let y = side;
  const img = env.image && h.image ? env.image : null;
  if (img) {
    const ph = (w * img.height) / img.width;
    p.drawImage(x, y, w, ph, { radius: 0, border: 'rgba(0, 0, 0, 0.12)', backdrop: '#000000' });
    y += ph;
  } else {
    /* 沒有照片：灰色的佔位與相機圖示 */
    const ph = 192;
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(x, y, w, ph);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, ph - 1);
    const cx = x + w / 2;
    const cy = y + ph / 2 - 8;
    ctx.save();
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRectPath(ctx, cx - 16, cy - 10, 32, 22, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(cx - 6, cy - 14, 12, 4);
    const ns: TextStyle = {
      family: DECOR_SANS,
      weight: 400,
      size: 12,
      lineHeight: 1.4,
      color: '#9ca3af',
    };
    ctx.font = fontOf(ns);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(S.noPhoto, cx, cy + 28);
    ctx.restore();
    y += ph;
  }
  y += 22;
  if (h.title.trim()) {
    y += p.title(h.title, x, y, w, p.titleStyle(22), 'center');
    y += 8;
  }
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.65 }), 'center');
  if (p.hasStamp) p.stamp(W - 16 - 40, 16);
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

/* ---------- 報紙 ---------- */

function newspaper(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  const ink = h.textColor;
  /* 雙線外框 */
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
  ctx.strokeRect(4.25, 4.25, W - 8.5, H - 8.5);
  const pad = 28;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  const mast = h.extra.masthead.trim();
  if (mast) {
    const ms: TextStyle = {
      family: DECOR_SERIF,
      weight: 900,
      size: 30,
      lineHeight: 1.25,
      letterSpacing: 4,
      color: ink,
    };
    y += p.title(mast, x, y, w, ms, 'center');
    y += 6;
  }
  hline(ctx, x, y, w, 3, ink);
  y += 3;
  const date = h.extra.dateline.trim();
  if (date) {
    const ds = p.style({ size: 11, lineHeight: 1.5, letterSpacing: 2 });
    y += 5;
    y += p.title(date, x, y, w, ds, 'center');
    y += 5;
  } else y += 2;
  hline(ctx, x, y, w, 1, ink);
  y += 1 + 16;
  if (h.title.trim() || p.hasStamp) {
    y += p.headerRow(h.title, x, y, w, p.titleStyle(24, { weight: 900 }), 'center');
    y += 14;
  }
  const ih = p.imageBlock(x, y, w, { radius: 2 });
  if (ih) y += ih + 16;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.65 }), h.align, {
      columns: newspaperColumns(W),
      gap: 24,
      rule: rgba(ink, 0.35),
    });
}

/* ---------- 通緝令 ---------- */

const WANTED_FRAME = 12;

function wanted(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  const ink = h.textColor;
  /* 舊紙的四周變暗 */
  const v = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.3,
    W / 2,
    H / 2,
    Math.hypot(W, H) / 2,
  );
  v.addColorStop(0, rgba(ink, 0));
  v.addColorStop(1, rgba(ink, 0.22));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  /* 粗框＋內側細線 */
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(WANTED_FRAME, WANTED_FRAME, W - WANTED_FRAME * 2, H - WANTED_FRAME * 2);
  ctx.fillStyle = ink;
  ctx.fill('evenodd');
  ctx.strokeStyle = rgba(ink, 0.7);
  ctx.lineWidth = 1.5;
  const inset = WANTED_FRAME + 6;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  const pad = WANTED_FRAME + 26;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  const heading = h.extra.heading.trim();
  if (heading) {
    const hs: TextStyle = {
      family: DECOR_SERIF,
      weight: 900,
      size: 40,
      lineHeight: 1.2,
      letterSpacing: 6,
      color: ink,
    };
    y += p.title(heading, x, y, w, hs, 'center');
    y += 8;
    hline(ctx, x, y, w, 4, ink);
    y += 4 + 14;
  }
  if (h.title.trim()) {
    y += p.title(h.title, x, y, w, p.titleStyle(22), 'center');
    y += 12;
  }
  const ih = p.imageBlock(x, y, w, { radius: 0, border: ink });
  if (ih) y += ih + 14;
  if (p.check(y, bottom))
    p.body(
      x,
      y,
      w,
      bottom,
      p.style({ size: h.fontSize, lineHeight: 1.65, weight: p.font.bold }),
      'center',
    );
  if (p.hasStamp) p.stamp(W - inset - 6 - 40, inset + 6);
}

/* ---------- 系統視窗 ---------- */

const WINDOW_BAR = 34;

function windowTheme(p: Painter): void {
  const { ctx, W, H, h } = p;
  surface(p, whole(p));
  /* 標題列 */
  const bar = ctx.createLinearGradient(0, 0, 0, WINDOW_BAR);
  bar.addColorStop(0, '#f5f5f5');
  bar.addColorStop(1, '#dedede');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, WINDOW_BAR);
  hline(ctx, 0, WINDOW_BAR - 1, W, 1, '#c0c0c0');
  const dots: [string, string][] = [
    ['#ff5f56', '#e0443e'],
    ['#ffbd2e', '#dea123'],
    ['#27c93f', '#1aab29'],
  ];
  dots.forEach(([fill, edge], i) => {
    ctx.beginPath();
    ctx.arc(19.5 + i * 18, WINDOW_BAR / 2, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  if (h.title.trim()) {
    const font = fontOf({ family: DECOR_SANS, weight: 600, size: 12 });
    const room = W - 2 * 76;
    const text = ellipsize(ctx, font, h.title.trim(), Math.max(0, room));
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = '#3c3c3c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, WINDOW_BAR / 2 + 0.5);
    ctx.restore();
  }
  const pad = 28;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = WINDOW_BAR + pad;
  if (h.title.trim() || p.hasStamp) {
    y += p.headerRow(h.title, x, y, w, p.titleStyle(19), h.align);
    y += 10;
    hline(ctx, x, y, w, 1, rgba(h.textColor, 0.15));
    y += 1 + 22;
  }
  const ih = p.imageBlock(x, y, w);
  if (ih) y += ih + 18;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.65 }), h.align);
  ctx.beginPath();
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 9.5);
  ctx.strokeStyle = '#c0c0c0';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ---------- 狀態視窗（遊戲／網文的系統訊息） ---------- */

const STATUS_RADIUS = 8;

function status(p: Painter): void {
  const { ctx, W, H, h, env } = p;
  const ink = h.textColor;
  surface(p, whole(p));
  /* 掃描線 */
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  for (let y = 2; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  /* 內側的光暈：外面畫一圈很大的形狀，只留下它落在裡面的陰影 */
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, W + 400, H + 400);
  roundRectPath(ctx, 0, 0, W, H, STATUS_RADIUS);
  ctx.shadowColor = rgba(ink, 0.3);
  ctx.shadowBlur = 20 * env.scale;
  ctx.fillStyle = '#000000';
  ctx.fill('evenodd');
  ctx.restore();
  const pad = 30;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  const label = h.extra.label.trim();
  const tw = p.hasStamp ? w - 52 : w;
  const ls = p.style({ size: 12, lineHeight: 1.5, letterSpacing: 3, color: rgba(ink, 0.8) });
  const ts = p.titleStyle(22, { glow: { color: ink, blur: 8 } });
  const labelRows = label ? p.flowPlain(label, ls, tw) : [];
  const titleRows = p.flowPlain(h.title, ts, tw, h.align);
  if (labelRows.length || titleRows.length || p.hasStamp) {
    let hy = y;
    hy += p.drawRows(labelRows, x, hy, ls);
    if (labelRows.length && titleRows.length) hy += 4;
    hy += p.drawRows(titleRows, x, hy, ts);
    if (p.hasStamp) p.stamp(x + w - 40, y);
    y = Math.max(hy, p.hasStamp ? y + 40 : hy) + 8;
    hline(ctx, x, y, w, 1, rgba(ink, 0.9));
    y += 1 + 20;
  }
  const ih = p.imageBlock(x, y, w, { border: rgba(ink, 0.45) });
  if (ih) y += ih + 20;
  if (p.check(y, bottom))
    p.body(
      x,
      y,
      w,
      bottom,
      p.style({
        size: h.fontSize,
        lineHeight: 2,
        weight: p.font.bold,
        letterSpacing: h.fontSize * 0.025,
        glow: { color: ink, blur: 2 },
      }),
      h.align,
    );
  /* 外框與四角的括弧 */
  ctx.beginPath();
  roundRectPath(ctx, 1, 1, W - 2, H - 2, STATUS_RADIUS - 1);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = rgba(ink, 0.9);
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  const c = 9;
  const L = 14;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [c, c, 1, 1],
    [W - c, c, -1, 1],
    [c, H - c, 1, -1],
    [W - c, H - c, -1, -1],
  ] as const) {
    ctx.moveTo(cx + dx * L, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * L);
  }
  ctx.stroke();
  ctx.restore();
}

/* ---------- 終端機 ---------- */

/** 終端機標頭的文字：「提示字元:~/標題」 */
export function terminalHeader(prompt: string, title: string): string {
  const p = prompt.trim();
  const t = title.trim();
  if (p && t) return `${p}:~/${t}`;
  if (p) return `${p}:~$`;
  if (t) return `~/${t}`;
  return '';
}

function terminal(p: Painter): void {
  const { ctx, W, H, h } = p;
  const ink = h.textColor;
  surface(p, whole(p));
  const pad = 24;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = pad;
  const head = terminalHeader(h.extra.prompt, h.title);
  if (head || p.hasStamp) {
    const hs = p.style({ size: 14, lineHeight: 1.5, color: rgba(ink, 0.8) });
    y += p.headerRow(head, x, y, w, hs, 'left', { stampSize: 28, gap: 10 });
    y += 8;
    hline(ctx, x, y, w, 1, rgba(ink, 0.8));
    y += 1 + 16;
  }
  const ih = p.imageBlock(x, y, w, { border: rgba(ink, 0.5) });
  if (ih) y += ih + 16;
  if (p.check(y, bottom))
    p.body(
      x,
      y,
      w,
      bottom,
      p.style({ size: h.fontSize, lineHeight: 1.65, glow: { color: rgba(ink, 0.45), blur: 4 } }),
      h.align,
      { prefix: '> ', cursor: '_' },
    );
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
}

/* ---------- 簡訊 ---------- */

const PHONE_BEZEL = 12;
const PHONE_RADIUS = 40;
export const SMS_COLORS = {
  sent: '#0b93f6',
  sentText: '#ffffff',
  received: '#e5e5ea',
  receivedText: '#000000',
} as const;

function sms(p: Painter): void {
  const { ctx, W, H, h } = p;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);
  const inner: Region = {
    x: PHONE_BEZEL,
    y: PHONE_BEZEL,
    w: W - PHONE_BEZEL * 2,
    h: H - PHONE_BEZEL * 2,
  };
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, inner.x, inner.y, inner.w, inner.h, PHONE_RADIUS - PHONE_BEZEL);
  ctx.clip();
  surface(p, inner);
  /* 狀態列：背景亮的時候黑色，否則用文字顏色（同原作） */
  const bar = luminance(h.bgColor) > 0.6 ? '#000000' : h.textColor;
  drawStatusIcons(ctx, inner.x + inner.w - 24, inner.y + 22, bar);
  let y = inner.y + 40;
  const contact = h.extra.contact.trim();
  if (contact) {
    const cs = p.style({ size: 15, lineHeight: 1.4, weight: p.font.bold, color: bar });
    y += p.title(contact, inner.x + 20, y, inner.w - 40, cs, 'center');
    y += 8;
    hline(ctx, inner.x, y, inner.w, 1, rgba(bar, 0.12));
    y += 1;
  }
  y += 10;
  const x = inner.x + 20;
  const w = inner.w - 40;
  const bottom = inner.y + inner.h - 40;
  const ih = p.imageBlock(x, y, w, { radius: 8 });
  if (ih) y += ih + 10;
  const s = p.style({ size: h.fontSize, lineHeight: 1.4 });
  const measure = measurer(ctx, s);
  for (const m of parseSms(h.body)) {
    const b = bubbleLayout(m.text, {
      maxWidth: w * 0.8,
      padX: 16,
      padY: 10,
      lineHeight: rowHeight(s),
      measure,
    });
    if (y + b.height > bottom + 0.5) {
      p.overflow = true;
      break;
    }
    const bx = m.sent ? x + w - b.width : x;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, bx, y, b.width, b.height, m.sent ? [18, 18, 2, 18] : [18, 18, 18, 2]);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 2 * p.env.scale;
    ctx.shadowOffsetY = 1 * p.env.scale;
    ctx.fillStyle = m.sent ? SMS_COLORS.sent : SMS_COLORS.received;
    ctx.fill();
    ctx.restore();
    drawRows(
      ctx,
      b.rows,
      bx + 16,
      y + 10,
      { ...s, color: m.sent ? SMS_COLORS.sentText : SMS_COLORS.receivedText },
      p.env.scale,
    );
    y += b.height + 10;
  }
  /* 底部的橫條 */
  ctx.fillStyle = rgba(bar, 0.35);
  ctx.beginPath();
  roundRectPath(ctx, W / 2 - 55, inner.y + inner.h - 10, 110, 4, 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- 電子郵件 ---------- */

function email(p: Painter): void {
  const { ctx, W, H, h } = p;
  const ink = h.textColor;
  surface(p, whole(p));
  hline(ctx, 0, 0, W, 4, rgba(ink, 0.85));
  const pad = 28;
  const x = pad;
  const w = W - pad * 2;
  const bottom = H - pad;
  let y = 4 + 24;
  if (h.title.trim() || p.hasStamp) {
    y += p.headerRow(h.title, x, y, w, p.titleStyle(20), h.align);
    y += 14;
  }
  const from = h.extra.from.trim();
  const rows = (
    [
      [S.mailFrom, from],
      [S.mailTo, h.extra.to.trim()],
      [S.mailDate, h.extra.date.trim()],
    ] as const
  ).filter(([, v]) => v);
  if (rows.length) {
    const avatar = 36;
    let tx = x;
    if (from) {
      ctx.beginPath();
      ctx.arc(x + avatar / 2, y + avatar / 2, avatar / 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(ink, 0.12);
      ctx.fill();
      const initial = Array.from(from)[0]?.toUpperCase() ?? '';
      ctx.save();
      ctx.font = fontOf({ family: p.font.family, weight: p.font.bold, size: 16 });
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, x + avatar / 2, y + avatar / 2 + 1);
      ctx.restore();
      tx = x + avatar + 12;
    }
    const ls = p.style({ size: 12, lineHeight: 1.6, color: rgba(ink, 0.55) });
    const vs = p.style({ size: 12.5, lineHeight: 1.6, color: rgba(ink, 0.88) });
    const lineH = rowHeight(vs);
    const labelW = Math.max(...rows.map(([l]) => measureWidth(ctx, fontOf(ls), l))) + 10;
    rows.forEach(([label, value], i) => {
      const ry = y + i * lineH;
      p.drawRows(p.flowPlain(label, ls, labelW), tx, ry + (lineH - rowHeight(ls)) / 2, ls);
      const vr = p.flowPlain(value, vs, Math.max(10, x + w - tx - labelW)).slice(0, 1);
      p.drawRows(vr, tx + labelW, ry, vs);
    });
    y += Math.max(from ? avatar : 0, rows.length * lineH) + 14;
  }
  hline(ctx, x, y, w, 1, rgba(ink, 0.15));
  y += 1 + 18;
  const ih = p.imageBlock(x, y, w);
  if (ih) y += ih + 18;
  if (p.check(y, bottom))
    p.body(x, y, w, bottom, p.style({ size: h.fontSize, lineHeight: 1.7 }), h.align);
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

/* ---------- 主題表 ---------- */

export interface ThemePainter {
  /** 外形（剪裁的路徑；透明的地方匯出時是透明的） */
  shape: (ctx: Ctx, W: number, H: number) => void;
  paint: (p: Painter) => void;
}

const rect = (ctx: Ctx, W: number, H: number) => ctx.rect(0, 0, W, H);

export const THEME_PAINTERS: Record<ThemeId, ThemePainter> = {
  basic: { shape: rect, paint: basic },
  memo: { shape: rect, paint: memo },
  sticky: { shape: stickyShape, paint: sticky },
  polaroid: { shape: rect, paint: polaroid },
  newspaper: { shape: rect, paint: newspaper },
  wanted: { shape: rect, paint: wanted },
  window: { shape: (ctx, W, H) => roundRectPath(ctx, 0, 0, W, H, 10), paint: windowTheme },
  status: { shape: (ctx, W, H) => roundRectPath(ctx, 0, 0, W, H, STATUS_RADIUS), paint: status },
  terminal: { shape: rect, paint: terminal },
  sms: { shape: (ctx, W, H) => roundRectPath(ctx, 0, 0, W, H, PHONE_RADIUS), paint: sms },
  email: { shape: rect, paint: email },
};
