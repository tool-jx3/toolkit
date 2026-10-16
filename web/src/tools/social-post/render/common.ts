/**
 * 各畫面共用的片段：狀態列、大頭貼（含動態外圈）、徽章、多段文字轉成指令。
 */
import type { ImageRef, Profile, ScreenSettings, SocialState } from '../model';
import { BADGE, type FontSpec, type Line, type Measure, PIN, type Run } from '../text';
import type { Op } from './ops';
import { type Palette, RING_STOPS } from './theme';

/** 畫一個畫面需要的東西 */
export interface Env {
  measure: Measure;
  pal: Palette;
  /** 字級倍率 */
  fs: number;
  state: SocialState;
  /** 編輯中（畫空格子的提示、選取框；PNG 與 HTML 是 false） */
  edit: boolean;
}

export const W = 390;
export const PHONE_H = 844;
export const STATUS_H = 54;

/* ---------- 狀態列（3.4） ---------- */

/** 電池、訊號、Wi-Fi（右邊對齊在 right、垂直置中在 cy） */
export function statusIcons(
  right: number,
  cy: number,
  color: string,
  battery: number,
  k = 1,
): Op[] {
  const ops: Op[] = [];
  const sigW = 18 * k;
  const wifiW = 16 * k;
  const batW = 27 * k;
  const gap = 6 * k;
  let x = right - (sigW + wifiW + batW + gap * 2);
  /* 訊號：4 格 */
  const bars: [number, number, number][] = [
    [0, 8, 4],
    [5, 5.5, 6.5],
    [10, 3, 9],
    [15, 0, 12],
  ];
  const top = cy - 6 * k;
  for (const [bx, by, bh] of bars)
    ops.push({
      t: 'rect',
      x: x + bx * k,
      y: top + by * k,
      w: 3 * k,
      h: bh * k,
      r: 0.7 * k,
      fill: color,
    });
  x += sigW + gap;
  /* Wi-Fi */
  ops.push({
    t: 'icon',
    name: 'wifi',
    x: x - 1.5 * k,
    y: cy - 10 * k,
    size: 19 * k,
    color,
    sw: 2.4,
  });
  x += wifiW + gap;
  /* 電池 */
  const lv = Math.max(4, Math.min(100, battery));
  const btop = cy - 6.5 * k;
  ops.push({
    t: 'rect',
    x: x + 0.5 * k,
    y: btop + 0.5 * k,
    w: 23 * k,
    h: 12 * k,
    r: 3.5 * k,
    stroke: { color: withAlpha(color, 0.4), width: 1 * k },
  });
  ops.push({
    t: 'rect',
    x: x + 2 * k,
    y: btop + 2 * k,
    w: (lv / 100) * 20 * k,
    h: 9 * k,
    r: 2 * k,
    fill: battery <= 20 ? '#ff3b30' : color,
  });
  ops.push({
    t: 'rect',
    x: x + 25 * k,
    y: btop + 4.5 * k,
    w: 1.4 * k,
    h: 4 * k,
    r: 0.7 * k,
    fill: withAlpha(color, 0.45),
  });
  return ops;
}

/** 狀態列（高 54；畫在 y 起） */
export function statusBar(env: Env, y: number, color: string): Op[] {
  const sc: ScreenSettings = env.state.screen;
  const ops: Op[] = [];
  const lh = 16 * env.fs;
  ops.push({
    t: 'text',
    x: 36,
    y: y + 20 - lh / 2,
    lh,
    text: sc.clock,
    font: { family: 'Noto Sans TC', weight: 600, size: 16 * env.fs },
    color,
  });
  if (sc.icons) ops.push(...statusIcons(W - 26, y + 20, color, sc.battery));
  return ops;
}

/* ---------- 大頭貼與徽章 ---------- */

/**
 * 大頭貼（中心、直徑）；ring＝動態外圈：外圈 2 ＋ 底色 2，圖在裡面（同原作 .ring）。
 * 回傳指令與外框的直徑。
 */
export function avatar(
  img: ImageRef | null,
  cx: number,
  cy: number,
  d: number,
  pal: Palette,
  ring = false,
): Op[] {
  const ops: Op[] = [];
  if (ring) {
    const R = d / 2 + 2;
    ops.push({
      t: 'circle',
      cx,
      cy,
      r: R,
      fill: { linear: { x0: cx - R, y0: cy + R, x1: cx + R, y1: cy - R, stops: RING_STOPS } },
    });
    ops.push({ t: 'circle', cx, cy, r: d / 2, fill: pal.bg });
    ops.push({ t: 'avatar', img, cx, cy, r: d / 2 - 2, bg: avatarBg(pal) });
    return ops;
  }
  ops.push({ t: 'avatar', img, cx, cy, r: d / 2, bg: avatarBg(pal) });
  return ops;
}

/** 預設人像的底色（淺色／深色） */
export const avatarBg = (pal: Palette) => (pal.bg === '#ffffff' ? '#c7cad1' : '#4a4f57');

/** 認證徽章（左上角、邊長）：主色的圓＋白色的勾 */
export function badge(x: number, y: number, size: number, pal: Palette): Op[] {
  return [
    { t: 'circle', cx: x + size / 2, cy: y + size / 2, r: size / 2, fill: pal.accent },
    { t: 'icon', name: 'check', x, y, size, color: '#ffffff', sw: 3 },
  ];
}

/* ---------- 文字 ---------- */

/** 徽章在文字裡的寬度（左邊空 margin） */
export const badgeRun = (font: FontSpec, size: number, margin = 4): Run => ({
  text: BADGE,
  font,
  color: '',
  advance: size + margin,
});

/**
 * 排好的行轉成指令（左上 x、y；每行 lh）。徽章片段畫成徽章（size＝advance − margin）。
 */
export function linesToOps(
  lines: Line[],
  x: number,
  y: number,
  lh: number,
  pal: Palette,
  badgeMargin = 4,
): Op[] {
  const ops: Op[] = [];
  lines.forEach((line, i) => {
    const top = y + i * lh;
    for (const r of line.runs) {
      if (r.text === BADGE) {
        const size = (r.advance ?? 14) - badgeMargin;
        ops.push(...badge(x + r.x + badgeMargin, top + (lh - size) / 2 + 1, size, pal));
        continue;
      }
      if (r.text === PIN) {
        const size = (r.advance ?? 15) - 3;
        ops.push({
          t: 'icon',
          name: 'pinned',
          x: x + r.x,
          y: top + (lh - size) / 2,
          size,
          color: r.color,
          sw: 2.4,
        });
        continue;
      }
      if (!r.text.trim()) continue;
      ops.push({ t: 'text', x: x + r.x, y: top, lh, text: r.text, font: r.font, color: r.color });
    }
  });
  return ops;
}

/** 帳號（作者的留言、限時動態等用到的帳號資料） */
export const me = (env: Env): Profile => env.state.profile;

export function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
