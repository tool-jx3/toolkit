/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 時間軸分頁（F028）的資料怎麼放、怎麼讀（原作的「圖層時間軸」laneKeyIdx、laneNextKeyIdx、laneData、frameDur）。
 * - 目前影格的資料在分頁頂層（chars、rels、notes、bg、W、H），既有的編輯程式照舊讀寫；其他影格在 tl.frames，
 *   frames[目前影格] 的這幾個欄位只是佔位（同一格的資料只有一份）。影格的編號、保持、秒數一律在 frames 裡。
 * - 保持中的軌道不存資料（原作存一份實體化的複本）：讀的時候往前找第一個不保持的格＝來源關鍵影格。
 *   目前影格的頂層永遠是完整的畫面（保持中的軌道也放著來源的內容，改了就自動變成關鍵影格，state/tlActions）。
 * 動作在 state/tlActions.ts，補間在 logic/tween.ts。
 */
import type { Char, Note, Rel, Sheet, Timeline, TlFrame, TlLane } from './types';

export const TL_LANES: readonly TlLane[] = ['chars', 'notes', 'charts', 'bg'];
/** 播放速度鈕的檔位（讀檔接受 0.25～4） */
export const TL_SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
export const TL_SPEED_MIN = 0.25;
export const TL_SPEED_MAX = 4;
/** 每秒推進的影格單位（相鄰兩格的過場約 1.18 秒；原作的 TWEEN_UNITS_PER_SEC） */
export const TWEEN_UNITS_PER_SEC = 0.85;
/** 每格秒數的範圍（原作的影格播放時間） */
export const DUR_MIN = 0.05;
export const DUR_MAX = 600;

/** 便利貼屬於哪一條軌道：圖表節點＝圖表，其他＝便利貼 */
export const laneOfNote = (n: Pick<Note, 'chart'>): TlLane => (n.chart ? 'charts' : 'notes');

export const holds = (f: Pick<TlFrame, 'hold'> | undefined, lane: TlLane): boolean =>
  !!f && f.hold.includes(lane);

/** 一格的畫面資料 */
export interface FrameData {
  W: number;
  H: number;
  chars: Char[];
  rels: Rel[];
  notes: Note[];
  bg: string | null;
}

/** 第 k 格自己存的資料（目前影格＝分頁頂層；保持中的軌道是空的） */
export function ownData(s: Sheet, k: number): FrameData {
  const tl = s.tl;
  if (!tl || k === tl.active)
    return { W: s.W, H: s.H, chars: s.chars, rels: s.rels, notes: s.notes, bg: s.bg };
  const f = tl.frames[k];
  return { W: f.W, H: f.H, chars: f.chars, rels: f.rels, notes: f.notes, bg: f.bg };
}

/** 第 k 格這條軌道的來源關鍵影格：往前找第一個不保持的格 */
export function laneKeyIdx(tl: Timeline, k: number, lane: TlLane): number {
  let i = Math.min(Math.max(0, k), tl.frames.length - 1);
  while (i > 0 && holds(tl.frames[i], lane)) i--;
  return Math.max(0, i);
}

/** k 之後下一個這條軌道的關鍵影格（沒有＝-1） */
export function laneNextKeyIdx(tl: Timeline, k: number, lane: TlLane): number {
  for (let i = k + 1; i < tl.frames.length; i++) if (!holds(tl.frames[i], lane)) return i;
  return -1;
}

/** 角色與關係這條軌道在第 k 格生效的內容 */
export function laneChars(s: Sheet, k: number): { chars: Char[]; rels: Rel[] } {
  if (!s.tl) return { chars: s.chars, rels: s.rels };
  const d = ownData(s, laneKeyIdx(s.tl, k, 'chars'));
  return { chars: d.chars, rels: d.rels };
}

/** 便利貼或圖表這條軌道在第 k 格生效的內容 */
export function laneNotes(s: Sheet, k: number, lane: 'notes' | 'charts'): Note[] {
  const src = s.tl ? ownData(s, laneKeyIdx(s.tl, k, lane)).notes : s.notes;
  return src.filter((n) => laneOfNote(n) === lane);
}

/** 背景這條軌道在第 k 格生效的內容 */
export function laneBg(s: Sheet, k: number): string | null {
  return s.tl ? ownData(s, laneKeyIdx(s.tl, k, 'bg')).bg : s.bg;
}

/** 第 k 格看到的畫面（保持中的軌道換成來源的；便利貼＝自己的關鍵軌道＋保持中的軌道，同原作的實體化順序） */
export function frameView(s: Sheet, k: number): FrameData {
  const tl = s.tl;
  /* 目前影格的頂層永遠是完整的畫面 */
  if (!tl || k === tl.active) return ownData(s, k);
  const own = ownData(s, k);
  const f = tl.frames[k];
  const hold = f?.hold ?? [];
  if (!hold.length) return own;
  const lc = holds(f, 'chars') ? laneChars(s, k) : { chars: own.chars, rels: own.rels };
  const hN = holds(f, 'notes');
  const hC = holds(f, 'charts');
  const notes =
    hN || hC
      ? [
          ...own.notes.filter((n) => !hold.includes(laneOfNote(n))),
          ...(hN ? laneNotes(s, k, 'notes') : []),
          ...(hC ? laneNotes(s, k, 'charts') : []),
        ]
      : own.notes;
  return {
    W: own.W,
    H: own.H,
    chars: lc.chars,
    rels: lc.rels,
    notes,
    bg: holds(f, 'bg') ? laneBg(s, k) : own.bg,
  };
}

/** 播放速度（0.25～4，其他＝1） */
export const tlSpeed = (tl: Pick<Timeline, 'speed'> | null | undefined): number => {
  const v = tl?.speed ?? 1;
  return Number.isFinite(v) && v >= TL_SPEED_MIN && v <= TL_SPEED_MAX ? v : 1;
};

/** 第 k 格過場到下一格的秒數（每格秒數或預設 1 ÷ 0.85，最後再除以播放速度；原作的 frameDur） */
export function frameDur(tl: Timeline, k: number): number {
  const d = tl.frames[k]?.dur;
  return (d && d > 0 ? d : 1 / TWEEN_UNITS_PER_SEC) / tlSpeed(tl);
}

/** 整段的秒數（最後一格的秒數沒有作用） */
export function tlDuration(tl: Timeline): number {
  let t = 0;
  for (let k = 0; k < tl.frames.length - 1; k++) t += frameDur(tl, k);
  return t;
}

/** 位置 p（影格單位）→ 秒 */
export function secondsAt(tl: Timeline, p: number): number {
  const n = tl.frames.length;
  const q = Math.min(Math.max(0, p), n - 1);
  let t = 0;
  const i = Math.min(Math.floor(q), n - 2);
  for (let k = 0; k < i; k++) t += frameDur(tl, k);
  return i >= 0 ? t + (q - i) * frameDur(tl, i) : 0;
}

/** 秒 → 位置 p（影格單位；超過＝最後一格） */
export function posAt(tl: Timeline, sec: number): number {
  const n = tl.frames.length;
  if (n < 2) return 0;
  let t = Math.max(0, sec);
  for (let k = 0; k < n - 1; k++) {
    const d = frameDur(tl, k);
    if (t < d) return k + t / d;
    t -= d;
  }
  return n - 1;
}

/** 分頁裡每一格自己存的角色清單（目前影格＝頂層；保持中的不算）——跨整個專案的整理（角色庫同步、刪除、用量）都要看全部 */
export function charLists(s: Sheet): Char[][] {
  const out = [s.chars];
  s.tl?.frames.forEach((f, k) => {
    if (k !== s.tl?.active && !holds(f, 'chars')) out.push(f.chars);
  });
  return out;
}

/** 同上，關係 */
export function relLists(s: Sheet): Rel[][] {
  const out = [s.rels];
  s.tl?.frames.forEach((f, k) => {
    if (k !== s.tl?.active && !holds(f, 'chars')) out.push(f.rels);
  });
  return out;
}

/** 同上，便利貼 */
export function noteLists(s: Sheet): Note[][] {
  const out = [s.notes];
  s.tl?.frames.forEach((f, k) => {
    if (k !== s.tl?.active) out.push(f.notes);
  });
  return out;
}

/** 分頁用到的背景圖（每一格） */
export function bgIds(s: Sheet): string[] {
  const out: string[] = [];
  if (s.bg) out.push(s.bg);
  s.tl?.frames.forEach((f, k) => {
    if (k !== s.tl?.active && f.bg) out.push(f.bg);
  });
  return out;
}

/** 分頁的所有角色（每一格；給用量、預設編號、資產回收） */
export const allChars = (s: Sheet): Char[] => charLists(s).flat();
