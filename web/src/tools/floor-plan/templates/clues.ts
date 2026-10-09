/**
 * 「載入時放入隱藏線索」：每個範本有一組線索（哪一層、哪個房間、什麼小物、一句說明），
 * 載入時在房間裡找空位放下小物與說明文字（兩者都標成隱藏線索）。
 *
 * 找空位：在房間內縮 0.35 格的範圍裡、每 0.25 格試一個位置，避開家具（地毯之類不算）、文字、門的開門範圍與門窗前方、
 * 手畫的牆、巢狀的房間、房間名字（有沒有顯示面積都避開），挑離房間中心最近的。
 * 說明依序試：一行 → 斷成兩行 → 小一號的一行 → 小一號的兩行；都放不下時只找放得下小物的位置。
 */

import { labelLayout } from '../draw/labels';
import { THEMES } from '../draw/themes';
import { ASSET } from '../model/assets';
import { OPEN, SWING_DOORS } from '../model/catalog';
import { rectContains } from '../model/geometry';
import type { Rect } from '../model/types';
import type { TplFloor } from './builder';

export interface ClueSpec {
  floor: string;
  room: string;
  t: string;
  text: string;
}

let measure: CanvasRenderingContext2D | null | undefined;
function measureCtx(): CanvasRenderingContext2D | null {
  if (measure === undefined) {
    try {
      measure =
        typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      measure = null;
    }
  }
  return measure;
}

/** 文字寬（格）：量得到就量，量不到時中日韓文字算 1 個字級、其他 0.6 */
export function textWidth(text: string, size: number, weight = 600): number {
  const c = measureCtx();
  if (c) {
    c.font = `${weight} 100px ${THEMES.clean.font}`;
    return (c.measureText(text).width * size) / 100;
  }
  let w = 0;
  for (const ch of text) w += /[　-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.6;
  return w * size;
}

/** 長的說明斷成兩行：靠近中間的標點或空白，沒有時從正中間斷 */
export function wrapClueText(text: string): string {
  const chars = Array.from(text);
  if (chars.length < 7) return text;
  const mid = chars.length / 2;
  let cut = -1;
  chars.forEach((ch, i) => {
    if (/[ 、，,。]/.test(ch) && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
  });
  if (cut > 0 && Math.abs(cut - mid) < chars.length * 0.3) {
    const keep = chars[cut] === ' ' ? 0 : 1;
    return `${chars
      .slice(0, cut + keep)
      .join('')
      .trim()}\n${chars
      .slice(cut + 1)
      .join('')
      .trim()}`;
  }
  const at = Math.ceil(mid);
  return `${chars.slice(0, at).join('')}\n${chars.slice(at).join('')}`;
}

const hits = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r: Rect, p: number): Rect => ({
  x: r.x - p,
  y: r.y - p,
  w: r.w + p * 2,
  h: r.h + p * 2,
});

/** 房間裡 w × h 的空位（左上角；沒有時 null） */
export function findSpot(
  f: TplFloor,
  room: TplFloor['rooms'][number],
  w: number,
  h: number,
): { x: number; y: number } | null {
  const inset = 0.35;
  const step = 0.25;
  const blocks: Rect[] = [];
  for (const i of f.items) if (!ASSET[i.t]?.under) blocks.push(grow(i, 0.12));
  for (const t of f.texts) {
    const s = t.size || 0.7;
    const lines = t.text.split('\n');
    const tw = Math.max(...lines.map((l) => textWidth(l, s)));
    blocks.push({
      x: t.x - tw / 2 - 0.15,
      y: t.y - (s * 1.25 * lines.length) / 2 - 0.1,
      w: tw + 0.3,
      h: s * 1.25 * lines.length + 0.2,
    });
  }
  for (const o of f.openings) {
    const swing = SWING_DOORS.has(o.kind);
    /* 門（含開口）前後各一格不放（F194 的門前一格），會開的門那一側再讓出門板掃過的範圍；窗前 0.4 格 */
    const near = OPEN[o.kind].group === 'door' ? 1.05 : 0.4;
    const plus = swing && o.side > 0 ? Math.max(o.len + 0.1, near) : near;
    const minus = swing && o.side < 0 ? Math.max(o.len + 0.1, near) : near;
    blocks.push(
      o.o === 'h'
        ? { x: o.x - 0.1, y: o.y - minus, w: o.len + 0.2, h: minus + plus }
        : { x: o.x - minus, y: o.y - 0.1, w: minus + plus, h: o.len + 0.2 },
    );
  }
  for (const wl of f.walls)
    blocks.push(
      grow(
        {
          x: Math.min(wl.x1, wl.x2),
          y: Math.min(wl.y1, wl.y2),
          w: Math.abs(wl.x2 - wl.x1),
          h: Math.abs(wl.y2 - wl.y1),
        },
        0.25,
      ),
    );
  for (const r of f.rooms) if (r !== room && rectContains(room, r)) blocks.push(grow(r, 0.2));
  const c = measureCtx();
  if (c)
    for (const showSize of ['none', 'm2'] as const) {
      const lab = labelLayout(c, { ...room, id: '' }, { showSize }, THEMES.clean);
      if (lab) blocks.push(grow(lab.box, 0.2));
    }
  else blocks.push({ x: room.x + room.w / 2 - 1.6, y: room.y + room.h / 2 - 0.8, w: 3.2, h: 1.6 });
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = room.y + inset; y + h <= room.y + room.h - inset + 1e-6; y += step)
    for (let x = room.x + inset; x + w <= room.x + room.w - inset + 1e-6; x += step) {
      const r = { x, y, w, h };
      if (blocks.some((b) => hits(r, b))) continue;
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (!best || d < best.d) best = { x, y, d };
    }
  return best;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 把線索放進範本的樓層（找不到樓層或房間的略過） */
export function addClues(floors: TplFloor[], clues: readonly ClueSpec[]): void {
  for (const clue of clues) {
    const f = floors.find((fl) => fl.name === clue.floor);
    const room = f?.rooms.find((r) => r.name === clue.room);
    const a = ASSET[clue.t];
    if (!f || !room || !a) continue;
    const gap = 0.1;
    const one = clue.text;
    const two = wrapClueText(one);
    let placed: {
      x: number;
      y: number;
      ox: number;
      text: string;
      size: number;
      lines: number;
    } | null = null;
    for (const [text, size] of [
      [one, 0.42],
      [two, 0.42],
      [one, 0.34],
      [two, 0.34],
    ] as const) {
      const lines = text.split('\n');
      const tw = Math.max(...lines.map((l) => textWidth(l, size))) + 0.2;
      const bw = Math.max(a.w, tw);
      const bh = a.h + gap + size * 1.25 * lines.length;
      const spot = findSpot(f, room, bw, bh);
      if (spot) {
        placed = { ...spot, ox: (bw - a.w) / 2, text, size, lines: lines.length };
        break;
      }
    }
    if (!placed) {
      const spot = findSpot(f, room, a.w, a.h) ?? {
        x: room.x + room.w / 2 - a.w / 2,
        y: room.y + 0.4,
      };
      placed = { ...spot, ox: 0, text: two, size: 0.34, lines: two.split('\n').length };
    }
    const ix = r2(placed.x + placed.ox);
    const iy = r2(placed.y);
    f.items.push({ t: clue.t, x: ix, y: iy, w: a.w, h: a.h, rot: 0, clue: true });
    f.texts.push({
      text: placed.text,
      x: r2(ix + a.w / 2),
      y: r2(iy + a.h + gap + (placed.size * 1.25 * placed.lines) / 2),
      size: placed.size,
      bold: false,
      clue: true,
    });
  }
}
