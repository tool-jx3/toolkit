/**
 * 狀態條的幾何：一條之內的欄位寬度、條本體長度、整列寬高、條群與整體內容的大小、條本體輪廓（裁切路徑）。
 * CSS 產生（css.ts）與來源大小估算共用，數字依規格 3.3、3.6。純函式，不依賴 DOM。
 */
import { num } from '@/core/css';
import type { Settings, Shape } from './settings';

/** 條本體最短 16 px */
export const MIN_BODY = 16;

export interface BarGeometry {
  /** 上方一行／下方一行模式的文字列高（＝顯示中的標籤與目前值較大的字級） */
  lineH: number;
  /** 三欄／兩欄模式的文字列高（較大字級 × 1.15，無條件進位） */
  colLineH: number;
  /** 符號欄寬（符號大小＋間距；不顯示時 0） */
  symCol: number;
  /** 道具總寬（不含與條的距離；沒有道具時 0） */
  itemsW: number;
  /** 道具欄寬（道具總寬＋與條的距離） */
  itemsCol: number;
  bodyLen: number;
  bodyH: number;
  /** 一整列（含符號欄、文字欄、道具欄）的寬 */
  rowW: number;
  rowH: number;
}

export const itemsActive = (s: Settings): boolean => s.items.on;
export const symbolsActive = (s: Settings): boolean => s.symbols.show && !s.items.on;

/** 道具總寬：n 個大小 S、間距 g（可為負）→ n×S＋(n−1)×g */
export function itemsWidth(count: number, size: number, gap: number): number {
  return Math.max(size, count * size + (count - 1) * gap);
}

export function barGeometry(s: Settings): BarGeometry {
  const t = s.text;
  const labelShown = t.showLabel && !(s.textPos === 'inside' && s.insideAlign === 'value');
  const valueShown = t.valueMode !== 'none';
  const maxSize = Math.max(labelShown ? t.labelSize : 0, valueShown ? t.currentSize : 0);
  const lineH = Math.ceil(maxSize);
  const colLineH = Math.ceil(maxSize * 1.15);
  const symCol = symbolsActive(s) ? s.symbols.size + s.symbols.gap : 0;
  const itemsW = itemsActive(s) ? itemsWidth(s.items.count, s.items.size, s.items.gap) : 0;
  const itemsCol = itemsActive(s) ? itemsW + s.items.distance : 0;
  let body = s.barWidth - symCol;
  if (s.textPos === 'three') body -= s.labelWidth + s.valueWidth + 2 * s.textGap;
  if (s.textPos === 'two') body -= s.labelWidth + s.textGap;
  const bodyLen = Math.max(MIN_BODY, body);
  const bodyH = s.barHeight;
  let rowW = symCol + bodyLen + itemsCol;
  if (s.textPos === 'three') rowW += s.labelWidth + s.valueWidth + 2 * s.textGap;
  if (s.textPos === 'two') rowW += s.labelWidth + s.textGap;
  let rowH: number;
  if (s.textPos === 'top' || s.textPos === 'bottom')
    rowH = lineH > 0 ? lineH + s.textGap + bodyH : bodyH;
  else if (s.textPos === 'three' || s.textPos === 'two') rowH = Math.max(bodyH, colLineH);
  else rowH = bodyH;
  if (itemsActive(s)) rowH = Math.max(rowH, s.items.size);
  return { lineH, colLineH, symCol, itemsW, itemsCol, bodyLen, bodyH, rowW, rowH };
}

/** 實際的欄數（多欄時）＝min(欄數, 條數) */
export const effectiveColumns = (s: Settings): number =>
  s.direction === 'grid' ? Math.max(1, Math.min(s.columns, s.barCount)) : 1;

export interface Box {
  width: number;
  height: number;
}

/** 條群（條數那麼多條）的大小 */
export function groupBox(s: Settings, g = barGeometry(s)): Box {
  const n = s.barCount;
  const gap = s.barGap;
  if (s.direction === 'horizontal') return { width: n * g.rowW + (n - 1) * gap, height: g.rowH };
  if (s.direction === 'grid') {
    const c = effectiveColumns(s);
    const r = Math.ceil(n / c);
    return { width: c * g.rowW + (c - 1) * gap, height: r * g.rowH + (r - 1) * gap };
  }
  return { width: g.rowW, height: n * g.rowH + (n - 1) * gap };
}

/** 名稱框的高度（單行；依外觀的內距與外框，規格 3.3.7） */
export function nameBoxHeight(s: Settings, lines = 1): number {
  const n = s.name;
  const text = n.size * 1.3 * lines;
  switch (n.look) {
    case 'plate': {
      const bw =
        s.border.width > 0
          ? s.border.double
            ? Math.max(3, 3 * s.border.width)
            : s.border.width
          : 0;
      return text + 0.8 * n.size + 2 * bw;
    }
    case 'underline':
      return text + 0.25 * n.size + 2;
    case 'side':
      return text + 0.7 * n.size;
    case 'tab':
      return text + 0.6 * n.size;
    case 'badge':
      return text + 0.5 * n.size;
    default:
      return text;
  }
}

/** 名稱會不會出現（位置不是「不顯示」、名稱不是空白、壓在頭像底部時頭像要開） */
export function nameShown(s: Settings, name: string): boolean {
  if (s.name.pos === 'none' || !name.trim()) return false;
  if (s.name.pos === 'avatar' && !s.avatar.show) return false;
  return true;
}

/** 頭像＋條群（＋條群上方的名稱）的大小；不含整體上下左右的名稱 */
export function rowContentBox(s: Settings, nameH: number | null, g = barGeometry(s)): Box {
  const grp = groupBox(s, g);
  const col: Box =
    nameH !== null && s.name.pos === 'group'
      ? { width: grp.width, height: nameH + s.name.gap + grp.height }
      : grp;
  if (!s.avatar.show) return col;
  const a = s.avatar;
  if (a.pos === 'top')
    return { width: Math.max(a.width, col.width), height: a.height + a.gap + col.height };
  return { width: a.width + a.gap + col.width, height: Math.max(a.height, col.height) };
}

/** 整體外框向外伸出的量（外框間距＋線寬；規格 3.6） */
export function frameExtent(s: Settings): number {
  if (!s.frame.on) return 0;
  return s.frame.gap + frameLineReach(s);
}

/** 外框在框盒外緣之內佔的寬度（畫外框的元素離內容多遠：間距＋這個值） */
export function frameBoxInset(s: Settings): number {
  const w = s.frame.width;
  switch (s.frame.kind) {
    case 'double':
      return Math.max(3, 3 * w);
    case 'thin':
      return 2 * w;
    default:
      return w;
  }
}

function frameLineReach(s: Settings): number {
  const w = s.frame.width;
  switch (s.frame.kind) {
    case 'double':
      return Math.max(3, 3 * w);
    case 'glow':
      return 6 * w;
    case 'thin':
      return 2 * w;
    default:
      return w;
  }
}

/** #root 的外距＝外側留白＋max(0, 外框伸出的量) */
export const rootMargin = (s: Settings): number => s.margin + Math.max(0, frameExtent(s));

/**
 * 估算來源大小（字型已載入、名稱單行時應與實際量測一致；預覽仍以模擬頁的量測為準）。
 * name：名稱文字（空白＝不顯示）；nameWidth：名稱在「左側」時的寬（估不出來時 0）。
 */
export function estimateSourceSize(
  s: Settings,
  {
    name = '',
    nameWidth = 0,
    nameLines = 1,
  }: { name?: string; nameWidth?: number; nameLines?: number } = {},
): Box {
  const g = barGeometry(s);
  const shown = nameShown(s, name);
  const nameH = shown ? nameBoxHeight(s, nameLines) : null;
  const row = rowContentBox(s, nameH, g);
  let w = row.width;
  let h = row.height;
  if (shown && nameH !== null) {
    if (s.name.pos === 'top' || s.name.pos === 'bottom') h += nameH + s.name.gap;
    if (s.name.pos === 'left') {
      w += nameWidth + s.name.gap;
      h = Math.max(h, nameH);
    }
  }
  if (s.panel.on) {
    const bw = s.panel.borderWidth;
    w += 2 * s.panel.padding + (s.panel.strip ? 4 : 0) + 2 * bw;
    h += 2 * s.panel.padding + 2 * bw;
  }
  const m = rootMargin(s);
  return { width: Math.ceil(w + 2 * m - 1e-6), height: Math.ceil(h + 2 * m - 1e-6) };
}

/* ---------- 條本體的輪廓（規格 3.3.3） ---------- */

const n1 = (v: number) => num(v, 2);

/** 輪廓的頂點（多邊形形狀）；圓角矩形與膠囊形回傳 null */
export function shapePolygon(
  shape: Shape,
  w: number,
  h: number,
  p: { cut: number; skew: number },
): [number, number][] | null {
  switch (shape) {
    case 'slant': {
      const sk = Math.min(p.skew, w / 3);
      return [
        [sk, 0],
        [w, 0],
        [w - sk, h],
        [0, h],
      ];
    }
    case 'chamfer': {
      const c = Math.min(p.cut, h / 2, w / 4);
      return [
        [c, 0],
        [w - c, 0],
        [w, c],
        [w, h - c],
        [w - c, h],
        [c, h],
        [0, h - c],
        [0, c],
      ];
    }
    case 'arrow': {
      const c = Math.min(p.cut, w / 4);
      return [
        [c, 0],
        [w - c, 0],
        [w, h / 2],
        [w - c, h],
        [c, h],
        [0, h / 2],
      ];
    }
    case 'notch': {
      const c = Math.min(p.cut, h, w / 4);
      return [
        [0, 0],
        [w - c, 0],
        [w, c],
        [w, h],
        [c, h],
        [0, h - c],
      ];
    }
    default:
      return null;
  }
}

/** 圓角矩形／膠囊形的實際圓角半徑 */
export function shapeRadius(shape: Shape, w: number, h: number, radius: number): number {
  if (shape === 'pill') return Math.min(h / 2, w / 2);
  if (shape === 'round') return Math.max(0, Math.min(radius, h / 2, w / 2));
  return 0;
}

/** 輪廓的 SVG 路徑（以條本體左上角為原點的 px 座標）：clip-path 的 path() 與外框圖共用 */
export function shapePath(
  shape: Shape,
  w: number,
  h: number,
  p: { radius: number; cut: number; skew: number },
): string {
  const poly = shapePolygon(shape, w, h, p);
  if (poly) return `M${poly.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}Z`;
  const r = shapeRadius(shape, w, h, p.radius);
  if (r <= 0) return `M0 0H${n1(w)}V${n1(h)}H0Z`;
  const R = n1(r);
  return (
    `M${R} 0H${n1(w - r)}A${R} ${R} 0 0 1 ${n1(w)} ${R}V${n1(h - r)}` +
    `A${R} ${R} 0 0 1 ${n1(w - r)} ${n1(h)}H${R}A${R} ${R} 0 0 1 0 ${n1(h - r)}V${R}A${R} ${R} 0 0 1 ${R} 0Z`
  );
}

/** 分段：每段寬＝(w＋空隙) ÷ 段數 − 空隙（段數 ≤ 1 時不分段，回傳 null） */
export function segmentWidth(w: number, segments: number, gap: number): number | null {
  if (segments <= 1) return null;
  return (w + gap) / segments - gap;
}
