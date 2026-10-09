/**
 * 房間名字與地圖文字的排版（量字寬要用 canvas）。
 *
 * 房間名字：字級＝min(寬, 深) × 0.16 ＋ 0.3，夾在 0.46～0.68 格；名字比房間寬（扣掉 0.5 格）時——
 * 房間是直長的（深 > 寬 × 1.3）而且是中日韓文字、直排放得下 → 直排；直長的英數名字轉 90° 比縮小大 → 轉向；
 * 其他一律縮小到放得下（至少 0.34 格）。面積文字在名字下方，字級 × 0.72。名字可以用 lx、ly 拖到別的位置。
 */
import { sizeText } from '../model/geometry';
import type { Rect, Room, SizeMode, TextLabel } from '../model/types';
import type { FloorTheme } from './themes';

export interface LabelOptions {
  playerView?: boolean;
  hideNames?: boolean;
  showSize?: SizeMode;
}

export interface LabelLayout {
  name: string;
  size: string;
  fs: number;
  sizeFs: number;
  vertical: boolean;
  rotated: boolean;
  cx: number;
  cy: number;
  /** 名字（與面積）佔的範圍 */
  box: Rect;
}

const CJK = /[぀-ヿ㐀-鿿가-힯＀-￯豈-﫿]/;

/** 畫面上要顯示的名字（PL 檢視有 PL 名字時用它） */
export function roomDisplayName(room: Room, opts: LabelOptions): string {
  if (opts.hideNames) return '';
  if (opts.playerView && room.plName) return room.plName;
  return room.name || '';
}

export function labelLayout(
  c: CanvasRenderingContext2D,
  room: Room,
  opts: LabelOptions,
  theme: Pick<FloorTheme, 'font'>,
): LabelLayout | null {
  const name = roomDisplayName(room, opts);
  const size = sizeText(room, opts.showSize);
  if (!name && !size) return null;
  let fs = Math.max(0.46, Math.min(0.68, Math.min(room.w, room.h) * 0.16 + 0.3));
  let width = measureText(c, name, { weight: 800, size: fs, family: theme.font });
  let vertical = false;
  let rotated = false;
  const avail = room.w - 0.5;
  if (width > avail) {
    const chars = Array.from(name).length;
    const tall = room.h > room.w * 1.3;
    const cjk = CJK.test(name);
    const shrunk = Math.max(0.34, fs * (avail / width));
    const turned = Math.min(fs, fs * ((room.h - 0.5) / width));
    if (tall && cjk && chars * fs * 1.02 < room.h - 0.5) vertical = true;
    else if (tall && !cjk && turned > shrunk) {
      rotated = true;
      fs = Math.max(0.34, turned);
      width = measureText(c, name, { weight: 800, size: fs, family: theme.font });
    } else {
      fs = shrunk;
      width = measureText(c, name, { weight: 800, size: fs, family: theme.font });
    }
  }
  const cx = room.x + room.w / 2 + (room.lx || 0);
  const cy = room.y + room.h / 2 + (room.ly || 0);
  const sizeFs = fs * 0.72;
  let box: Rect;
  if (rotated) {
    const ww = fs + (size ? sizeFs * 1.2 : 0);
    box = {
      x: cx - ww / 2 - 0.1,
      y: cy - Math.max(width, 1) / 2 - 0.15,
      w: ww + 0.2,
      h: Math.max(width, 1) + 0.3,
    };
  } else if (vertical) {
    const hh = Array.from(name).length * fs * 1.02;
    box = { x: cx - fs * 0.7, y: cy - hh / 2, w: fs * 1.4, h: hh + (size ? sizeFs * 1.3 : 0) };
  } else {
    const hh = fs + (size ? sizeFs * 1.2 : 0);
    box = {
      x: cx - Math.max(width, 1) / 2 - 0.15,
      y: cy - hh / 2 - 0.1,
      w: Math.max(width, 1) + 0.3,
      h: hh + 0.2,
    };
  }
  return { name, size, fs, sizeFs, vertical, rotated, cx, cy, box };
}

/**
 * 地圖上的字以「格」為單位，字級常常不到 1（例如 0.6 格）。有些平台（Linux 的 Chrome）在這麼小的字級下會把字距
 * 捨入成 0 或 1 px，放大之後字擠在一起或拉得很開。所以一律用 TEXT_K 倍的字級畫，再整個縮回來。
 */
export const TEXT_K = 64;

export interface FontSpec {
  weight: number;
  /** 字級（格） */
  size: number;
  family: string;
}

export const fontCss = (f: FontSpec): string => `${f.weight} ${f.size * TEXT_K}px ${f.family}`;

/** 文字寬（格） */
export function measureText(c: CanvasRenderingContext2D, text: string, f: FontSpec): number {
  c.font = fontCss(f);
  return c.measureText(text).width / TEXT_K;
}

/** 文字加一圈底色（光暈）再填色；對齊方式（textAlign、textBaseline）由呼叫端先設好 */
export function haloText(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  f: FontSpec,
  color: string,
  halo: string | null,
  width: number,
): void {
  c.save();
  c.translate(x, y);
  c.scale(1 / TEXT_K, 1 / TEXT_K);
  c.font = fontCss(f);
  if (halo) {
    c.strokeStyle = halo;
    c.lineWidth = width * TEXT_K;
    c.lineJoin = 'round';
    c.strokeText(text, 0, 0);
  }
  c.fillStyle = color;
  c.fillText(text, 0, 0);
  c.restore();
}

/** 直排：一個字一個字往下排；長音、破折號轉 90° */
export function verticalText(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  f: FontSpec,
  color: string,
  halo: string | null,
  width: number,
): void {
  const size = f.size;
  const chars = Array.from(text);
  let yy = y - (chars.length * size * 1.02) / 2 + size / 2;
  for (const ch of chars) {
    if (/[ー〜～―—\-－]/.test(ch)) {
      c.save();
      c.translate(x, yy);
      c.rotate(Math.PI / 2);
      haloText(c, ch, 0, 0, f, color, halo, width);
      c.restore();
    } else haloText(c, ch, x, yy, f, color, halo, width);
    yy += size * 1.02;
  }
}

/** 地圖文字的字型 */
export const textFont = (t: Pick<TextLabel, 'size' | 'bold'>, family: string): FontSpec => ({
  weight: t.bold === false ? 600 : 800,
  size: t.size || 0.7,
  family,
});

/** 地圖文字佔的範圍（點選、範圍選取用）：每行寬取最大（至少 0.8 格），行高 1.25 倍 */
export function textBox(
  c: CanvasRenderingContext2D,
  t: Pick<TextLabel, 'x' | 'y' | 'text' | 'size' | 'bold'>,
  font: string,
): Rect {
  const size = t.size || 0.7;
  const f = textFont(t, font);
  const lines = String(t.text || '').split('\n');
  const width = Math.max(0.8, ...lines.map((l) => measureText(c, l, f)));
  const h = lines.length * size * 1.25;
  return { x: t.x - width / 2 - 0.1, y: t.y - h / 2, w: width + 0.2, h };
}
