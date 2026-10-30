/**
 * 事件之間的關聯線（規格 F93）：「A 導致 B」等四種；資料的整理、畫線的幾何（互動的時間軸與匯出的圖共用）。純計算。
 */

export type LinkKind = 'cause' | 'same' | 'conflict' | 'related';
export const LINK_KINDS: readonly LinkKind[] = ['cause', 'same', 'conflict', 'related'];

export interface Link {
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
  /** 一句說明（提示、設定欄） */
  note: string;
  /** GM 專用（PL 檢視、PL 用的輸出不畫） */
  gm: boolean;
}

export const LINK_LIMITS = { links: 3000, note: 200 } as const;

/** 線的樣式：導致＝箭頭；同時＝點線；矛盾＝紅色虛線＋中間的 ✕；相關＝灰色點線 */
export interface LinkStyle {
  color: string;
  dash: number[] | null;
  arrow: boolean;
  cross: boolean;
  width: number;
}

export const LINK_STYLES: Record<LinkKind, LinkStyle> = {
  cause: { color: '#5b6b85', dash: null, arrow: true, cross: false, width: 1.5 },
  same: { color: '#2b9fc2', dash: [2, 3], arrow: false, cross: false, width: 1.75 },
  conflict: { color: '#e0565b', dash: [6, 4], arrow: false, cross: true, width: 1.5 },
  related: { color: '#8a94a6', dash: [1, 4], arrow: false, cross: false, width: 1.75 },
};

let seq = 0;
export function linkId(): string {
  seq = (seq + 1) % 1e6;
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${seq.toString(36)}`;
}

/**
 * 讀回時整理：兩端要是存在的事件、不能連到自己；同樣兩端與種類的只留一條；超過上限截掉。
 * 回傳整理好的清單與略過的數目。
 */
export function normalizeLinks(
  raw: unknown,
  eventIds: ReadonlySet<string>,
): { links: Link[]; skipped: number; over: number } {
  const list = Array.isArray(raw) ? raw : [];
  const out: Link[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  let skipped = 0;
  let over = 0;
  for (const x of list) {
    if (!x || typeof x !== 'object') {
      skipped++;
      continue;
    }
    const o = x as Record<string, unknown>;
    const from = typeof o.from === 'string' ? o.from : '';
    const to = typeof o.to === 'string' ? o.to : '';
    if (!eventIds.has(from) || !eventIds.has(to) || from === to) {
      skipped++;
      continue;
    }
    const kind = LINK_KINDS.includes(o.kind as LinkKind) ? (o.kind as LinkKind) : 'cause';
    const key = `${from}\u0000${to}\u0000${kind}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    if (out.length >= LINK_LIMITS.links) {
      over++;
      continue;
    }
    seen.add(key);
    let id = typeof o.id === 'string' && o.id && o.id.length <= 64 ? o.id : linkId();
    if (ids.has(id)) id = linkId();
    ids.add(id);
    out.push({
      id,
      from,
      to,
      kind,
      note: typeof o.note === 'string' ? o.note.slice(0, LINK_LIMITS.note) : '',
      gm: o.gm === true,
    });
  }
  return { links: out, skipped, over };
}

/* ---------- 幾何 ---------- */

/** 線的一端：事件畫出來的框（時間點：圓點的中心 x1＝x2；期間：色條的兩端；背景：標題的位置） */
export interface LinkBox {
  kind: 'point' | 'range' | 'background';
  x1: number;
  x2: number;
  /** 垂直的中心 */
  cy: number;
}

export interface LinkGeometry {
  /** SVG 的路徑（三次貝茲曲線） */
  d: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** 箭頭（導致）：三角形的三個點 */
  head: [number, number][] | null;
  /** 曲線的中點（矛盾的 ✕、提示） */
  mid: [number, number];
  /** 控制點離兩端的水平距離（曲線最多凸出這麼多） */
  dx: number;
}

const POINT_EDGE = 6;
const r2 = (v: number) => Math.round(v * 10) / 10;

/** 從 a 的右邊（時間點的圓點、色條的結束）連到 b 的左邊（圓點、色條的開始） */
export function linkGeometry(a: LinkBox, b: LinkBox, arrow: boolean): LinkGeometry {
  const sx = a.kind === 'point' ? a.x1 + POINT_EDGE : a.kind === 'range' ? a.x2 + 1 : a.x1 + 4;
  const sy = a.cy;
  const ex = b.kind === 'point' ? b.x1 - POINT_EDGE : b.kind === 'range' ? b.x1 - 1 : b.x1 + 4;
  const ey = b.cy;
  const dx = Math.max(24, Math.abs(ex - sx) * 0.45);
  const c1x = sx + dx;
  const c2x = ex - dx;
  const d = `M${r2(sx)} ${r2(sy)}C${r2(c1x)} ${r2(sy)} ${r2(c2x)} ${r2(ey)} ${r2(ex)} ${r2(ey)}`;
  /* 曲線在 t＝0.5 的位置 */
  const mid: [number, number] = [
    0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * ex,
    0.5 * sy + 0.5 * ey,
  ];
  const head: [number, number][] | null = arrow
    ? [
        [ex, ey],
        [ex - 7, ey - 4],
        [ex - 7, ey + 4],
      ]
    : null;
  return { d, sx, sy, ex, ey, head, mid, dx };
}

/** 線的水平範圍（只畫和畫面範圍有交集的線） */
export function linkExtent(g: LinkGeometry): { left: number; right: number } {
  return {
    left: Math.min(g.sx, g.ex) - g.dx,
    right: Math.max(g.sx, g.ex) + g.dx,
  };
}
