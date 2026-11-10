/**
 * 原作（Nuts-ABCd／floria_canvas）的資料格式：存在瀏覽器（localStorage `floria.data0`）與「データ保存」下載的文字檔
 * 都是同一種字串（規格 2.2）：
 *
 *   GS:1200|GN:11|NM:<名字，URL 編碼>|CD:<傷害格>|CF:<塗色>|CL:<線>
 *
 * 每一段的物件用「~」分開，物件裡的點用「-」分開：`L:P:x_y-P:x_y-<顏色或 h>`（線）、
 * `F:P:x_y-…-<顏色>`（塗色、傷害格）；`h` 是看不見的線（四邊與傷害格的邊），顏色空白＝預設色。
 * 讀進來時看不見的線不收（本站從四邊、對角線與傷害格自己算），沒有顏色的線與塗色補成原作的預設色。
 */
import { dedupeRing } from './canvas';
import { cellKey, diagonalSegment, sameSegment, segKey } from './geometry';
import {
  type Cell,
  COLORS,
  NAME_MAX,
  type Pt,
  SIZE_MAX,
  SIZE_MIN,
  UNIT,
  type VeinCanvas,
  type VeinFill,
  type VeinLine,
} from './types';

export class LegacyError extends Error {
  override name = 'LegacyError';
}

/** 讀進來的一張畫布（沒有 id）與略過的東西 */
export interface LegacyCanvas {
  canvas: Omit<VeinCanvas, 'id'>;
  /** 看不懂而略過的物件數 */
  skipped: number;
}

/** 看起來是不是原作的資料（開檔時自動辨識用） */
export function looksLikeLegacy(text: string): boolean {
  return /^\s*(GS:\d+\|)?GN:\d+(\||\s*$)/.test(text);
}

const HEX = /^#[0-9a-f]{6}$/i;

function parsePoint(s: string): Pt | null {
  const m = /^P:(-?\d+)_(-?\d+)$/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

interface Shape {
  pts: Pt[];
  hidden: boolean;
  color: string;
}

/** `P:x_y-P:x_y-<尾巴>`：尾巴是顏色、`h`、空白或沒有 */
function parseShape(body: string): Shape | null {
  const parts = body.split('-');
  const pts: Pt[] = [];
  let hidden = false;
  let color = '';
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s.startsWith('P:')) {
      const p = parsePoint(s);
      if (!p) return null;
      pts.push(p);
      continue;
    }
    if (i !== parts.length - 1) return null;
    if (s === 'h') hidden = true;
    else if (HEX.test(s)) color = s.toLowerCase();
    else if (s !== '') return null;
  }
  return { pts, hidden, color };
}

/** 原作的名字欄是 URL 編碼；解不開時照原樣 */
function decodeName(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 讀原作的一張畫布；整段看不懂時丟出 LegacyError（訊息可以直接顯示） */
export function parseLegacy(text: string): LegacyCanvas {
  /* 原作的字串沒有空白（名字是 URL 編碼）：貼上時夾帶的換行、空白都拿掉 */
  const raw = text.replace(/\s+/g, '');
  if (!raw) throw new LegacyError('沒有資料。');
  if (!looksLikeLegacy(raw)) throw new LegacyError('這不是原作（魔法脈描画ツール）的資料。');
  let size = 0;
  let name = '';
  const lines: VeinLine[] = [];
  const fills: VeinFill[] = [];
  const damage: Cell[] = [];
  let skipped = 0;
  const sections = raw.split('|');
  for (const sec of sections) {
    const tag = sec.slice(0, 3);
    const body = sec.slice(3);
    switch (tag) {
      case 'GN:': {
        const n = Number(body);
        if (!Number.isInteger(n) || n < SIZE_MIN || n > SIZE_MAX)
          throw new LegacyError(`格數「${body}」不在 ${SIZE_MIN}～${SIZE_MAX} 之間。`);
        size = n;
        break;
      }
      case 'NM:':
        name = decodeName(body).trim();
        break;
      case 'CL:':
      case 'CF:':
      case 'CD:':
        for (const item of body ? body.split('~') : []) {
          const kind = item.slice(0, 2);
          const shape = kind === 'L:' || kind === 'F:' ? parseShape(item.slice(2)) : null;
          if (!shape) {
            if (item) skipped++;
            continue;
          }
          if (tag === 'CL:') {
            if (shape.hidden) continue;
            if (shape.pts.length !== 2) {
              skipped++;
              continue;
            }
            lines.push({ a: shape.pts[0], b: shape.pts[1], color: shape.color || COLORS.line });
          } else if (tag === 'CF:') {
            const pts = dedupeRing(shape.pts);
            if (pts.length < 3) {
              skipped++;
              continue;
            }
            fills.push({ pts, color: shape.color || COLORS.fill });
          } else {
            const cell = squareCell(shape.pts);
            if (!cell) skipped++;
            else damage.push(cell);
          }
        }
        break;
      default:
        /* GS（格子的單位，固定 1200）、CT（同步用的草稿）與看不懂的段落略過 */
        break;
    }
  }
  if (!size) throw new LegacyError('資料裡沒有格數（GN）。');
  const max = size * UNIT;
  const inside = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= max && p[1] <= max;
  const onGrid = (p: Pt) => p[0] % UNIT === 0 && p[1] % UNIT === 0;
  /* 線：端點在格點上、在畫布裡；同一條線只留最後一條（後畫的在上面）；沒有顏色的對角線是預設的那一條 */
  const diag = diagonalSegment(size);
  const byKey = new Map<string, VeinLine>();
  for (const l of lines) {
    if (!inside(l.a) || !inside(l.b) || !onGrid(l.a) || !onGrid(l.b) || zeroLength(l)) {
      skipped++;
      continue;
    }
    if (l.color === COLORS.line && sameSegment([l.a, l.b], diag)) continue;
    const k = segKey([l.a, l.b]);
    byKey.delete(k);
    byKey.set(k, l);
  }
  const keptLines = [...byKey.values()];
  const keptFills = fills.filter((f) => {
    const ok = f.pts.every(inside);
    if (!ok) skipped++;
    return ok;
  });
  const cells: Cell[] = [];
  const cellSeen = new Set<string>();
  for (const c of damage) {
    if (c[0] < 0 || c[1] < 0 || c[0] >= size || c[1] >= size) {
      skipped++;
      continue;
    }
    const k = cellKey(c);
    if (cellSeen.has(k)) continue;
    cellSeen.add(k);
    cells.push(c);
  }
  return {
    canvas: {
      name: name.slice(0, NAME_MAX),
      size,
      lines: keptLines,
      fills: keptFills,
      damage: cells,
    },
    skipped,
  };
}

const zeroLength = (l: VeinLine) => l.a[0] === l.b[0] && l.a[1] === l.b[1];

/** 傷害格的四個角 → 格子（不是一格大小、對齊格線的正方形時 null） */
function squareCell(pts: Pt[]): Cell | null {
  const ring = dedupeRing(pts);
  if (ring.length !== 4) return null;
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  if (x0 % UNIT || y0 % UNIT) return null;
  const want = new Set([
    `${x0},${y0}`,
    `${x0 + UNIT},${y0}`,
    `${x0 + UNIT},${y0 + UNIT}`,
    `${x0},${y0 + UNIT}`,
  ]);
  if (!ring.every((p) => want.delete(`${p[0]},${p[1]}`))) return null;
  return [x0 / UNIT, y0 / UNIT];
}

/* ---------- 寫成原作的格式 ---------- */

const pt = (p: Pt) => `P:${p[0]}_${p[1]}`;

/**
 * 名字的 URL 編碼：原作只接受編碼後是英數與「:|_-~%#」的字串，所以 encodeURIComponent 不編的 . ! * ' ( ) 也編掉
 * （原作用 decodeURIComponent 讀回來，結果相同）。
 */
export function encodeLegacyName(name: string): string {
  return encodeURIComponent(name).replace(
    /[.!*'()]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * 寫成原作的字串（原作的「データ読込」或貼回原作的瀏覽器資料可以讀）：四邊（看不見）與對角線照原作放在最前面，
 * 傷害格的邊當成看不見的線（原作靠它們吸附），顏色寫成大寫的 #RRGGBB。
 */
export function serializeLegacy(c: VeinCanvas): string {
  const m = c.size * UNIT;
  const corner = {
    tl: [0, 0] as Pt,
    bl: [0, m] as Pt,
    br: [m, m] as Pt,
    tr: [m, 0] as Pt,
  };
  const line = (a: Pt, b: Pt, tail: string) => `L:${pt(a)}-${pt(b)}-${tail}`;
  const color = (hex: string) => hex.toUpperCase();
  const cl = [
    line(corner.tl, corner.bl, 'h'),
    line(corner.bl, corner.br, 'h'),
    line(corner.br, corner.tr, 'h'),
    line(corner.tr, corner.tl, 'h'),
    line(corner.tl, corner.br, ''),
    ...c.lines.map((l) => line(l.a, l.b, color(l.color))),
  ];
  const cd: string[] = [];
  for (const [x, y] of c.damage) {
    const x0 = x * UNIT;
    const y0 = y * UNIT;
    const p00: Pt = [x0, y0];
    const p10: Pt = [x0 + UNIT, y0];
    const p11: Pt = [x0 + UNIT, y0 + UNIT];
    const p01: Pt = [x0, y0 + UNIT];
    cd.push(`F:${pt(p00)}-${pt(p10)}-${pt(p11)}-${pt(p01)}-`);
    cl.push(line(p00, p10, 'h'), line(p10, p11, 'h'), line(p11, p01, 'h'), line(p01, p00, 'h'));
  }
  const cf = c.fills.map((f) => `F:${f.pts.map(pt).join('-')}-${color(f.color)}`);
  return [
    `GS:${UNIT}`,
    `GN:${c.size}`,
    `NM:${encodeLegacyName(c.name)}`,
    `CD:${cd.join('~')}`,
    `CF:${cf.join('~')}`,
    `CL:${cl.join('~')}`,
  ].join('|');
}
