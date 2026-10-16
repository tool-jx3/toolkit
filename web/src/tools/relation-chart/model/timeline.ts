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

/* ---------- 影格的增刪改（在草稿或一般物件上改；state/tlActions 包成一步復原） ---------- */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 所有影格都存著自己資料時（storeActive 之後）第 k 格看到的畫面 */
function storedView(s: Sheet, k: number): FrameData {
  const tl = s.tl as Timeline;
  return frameView({ ...s, tl: { ...tl, active: -1 } }, k);
}

/** 目前影格（頂層）寫回 frames[目前]（保持中的軌道不存）；之後要接 loadActive */
export function storeActive(s: Sheet): void {
  const tl = s.tl;
  if (!tl) return;
  const f = tl.frames[tl.active];
  const hc = holds(f, 'chars');
  f.W = s.W;
  f.H = s.H;
  f.chars = hc ? [] : clone(s.chars);
  f.rels = hc ? [] : clone(s.rels);
  f.notes = clone(s.notes.filter((n) => !holds(f, laneOfNote(n))));
  f.bg = holds(f, 'bg') ? null : s.bg;
}

/** 第 k 格變成目前影格：看到的畫面放到頂層、frames[k] 換成佔位（storeActive 之後呼叫） */
export function loadActive(s: Sheet, k: number): void {
  const tl = s.tl;
  if (!tl) return;
  const i = Math.min(tl.frames.length - 1, Math.max(0, k));
  const v = clone(storedView(s, i));
  tl.active = i;
  s.W = v.W;
  s.H = v.H;
  s.chars = v.chars;
  s.rels = v.rels;
  s.notes = v.notes;
  s.bg = v.bg;
  const f = tl.frames[i];
  f.W = v.W;
  f.H = v.H;
  f.chars = [];
  f.rels = [];
  f.notes = [];
  f.bg = null;
}

/** 下一個影格編號（建立時配，換位置不變） */
export const nextFrameNo = (tl: Timeline): number =>
  tl.frames.reduce((m, f) => Math.max(m, f.no), 0) + 1;

/** 一般分頁 → 時間軸分頁：現有內容成為第 1 格 */
export function toTimeline(s: Sheet, frameId: number): void {
  if (s.tl) return;
  s.tl = {
    frames: [
      {
        id: frameId,
        no: 1,
        W: s.W,
        H: s.H,
        chars: [],
        rels: [],
        notes: [],
        bg: null,
        hold: [],
        dur: null,
      },
    ],
    active: 0,
    hidden: [],
    locked: [],
    speed: 1,
  };
}

/** 時間軸分頁 → 一般分頁：只留目前影格（頂層本來就是目前影格的完整畫面）；回傳只在其他影格出現的角色 id */
export function fromTimeline(s: Sheet): Set<number> {
  if (!s.tl) return new Set();
  const keep = new Set(s.chars.map((c) => c.id));
  const gone = new Set(
    allChars(s)
      .map((c) => c.id)
      .filter((id) => !keep.has(id)),
  );
  s.tl = null;
  return gone;
}

/** 把第 k 格的這幾條保持中的軌道定格成自己的內容（storeActive 之後；看到的畫面不變） */
function materialize(s: Sheet, k: number, lanes: readonly TlLane[]): void {
  const tl = s.tl as Timeline;
  const f = tl.frames[k];
  const want = lanes.filter((l) => holds(f, l));
  if (!want.length) return;
  const v = clone(storedView(s, k));
  if (want.includes('chars')) {
    f.chars = v.chars;
    f.rels = v.rels;
  }
  const nl = want.filter((l) => l === 'notes' || l === 'charts');
  if (nl.length) {
    const own = new Set(f.notes.map((n) => n.id));
    f.notes = [
      ...f.notes,
      ...v.notes.filter((n) => (nl as TlLane[]).includes(laneOfNote(n)) && !own.has(n.id)),
    ];
  }
  if (want.includes('bg')) f.bg = v.bg;
  f.hold = f.hold.filter((l) => !want.includes(l));
}

/** 新增影格（延續上一格）：插在目前影格後面、四條軌道全部保持（原作的「新增空白影格」，7.4 第 16 項）；切過去 */
export function addFrame(s: Sheet, frameId: number): void {
  const tl = s.tl;
  if (!tl) return;
  storeActive(s);
  tl.frames.splice(tl.active + 1, 0, {
    id: frameId,
    no: nextFrameNo(tl),
    W: s.W,
    H: s.H,
    chars: [],
    rels: [],
    notes: [],
    bg: null,
    hold: [...TL_LANES],
    dur: null,
  });
  loadActive(s, tl.active + 1);
}

/** 複製第 k 格：插在它後面、全部是關鍵影格（看到的畫面整份複製；秒數不帶，原作）；切過去 */
export function copyFrame(s: Sheet, k: number, frameId: number): void {
  const tl = s.tl;
  if (!tl?.frames[k]) return;
  storeActive(s);
  const v = clone(storedView(s, k));
  tl.frames.splice(k + 1, 0, { id: frameId, no: nextFrameNo(tl), ...v, hold: [], dur: null });
  loadActive(s, k + 1);
}

/** 刪除第 k 格（只剩 1 格不能刪）；刪掉關鍵影格時，下一格在保持的軌道先定格（後面的畫面不變，原作） */
export function deleteFrame(s: Sheet, k: number): boolean {
  const tl = s.tl;
  if (!tl || tl.frames.length <= 1 || !tl.frames[k]) return false;
  storeActive(s);
  const activeId = tl.frames[tl.active].id;
  const del = tl.frames[k];
  const nx = tl.frames[k + 1];
  if (nx)
    materialize(
      s,
      k + 1,
      TL_LANES.filter((l) => !holds(del, l) && holds(nx, l)),
    );
  tl.frames.splice(k, 1);
  tl.frames[0].hold = [];
  const ai = tl.frames.findIndex((f) => f.id === activeId);
  loadActive(s, ai >= 0 ? ai : Math.min(k, tl.frames.length - 1));
  return true;
}

/** 調整影格順序：換到第 1 格的影格先定格（第 1 格永遠是關鍵影格）；保持中的軌道之後跟新的前一個關鍵影格 */
export function moveFrame(s: Sheet, from: number, to: number): boolean {
  const tl = s.tl;
  if (!tl) return false;
  const n = tl.frames.length;
  const dst = Math.min(Math.max(0, to), n - 1);
  if (from === dst || from < 0 || from >= n) return false;
  storeActive(s);
  materialize(s, dst === 0 ? from : from === 0 ? 1 : 0, TL_LANES);
  const activeId = tl.frames[tl.active].id;
  const [m] = tl.frames.splice(from, 1);
  tl.frames.splice(dst, 0, m);
  tl.frames[0].hold = [];
  loadActive(
    s,
    tl.frames.findIndex((f) => f.id === activeId),
  );
  return true;
}

/** 第 k 格這條軌道：保持 → 關鍵影格（定格目前看到的內容）、關鍵影格 → 保持（丟掉自己的內容）；第 1 格不能改 */
export function toggleKey(s: Sheet, k: number, lane: TlLane): boolean {
  const tl = s.tl;
  if (!tl || k <= 0 || !tl.frames[k]) return false;
  storeActive(s);
  const f = tl.frames[k];
  if (holds(f, lane)) materialize(s, k, [lane]);
  else {
    f.hold = TL_LANES.filter((l) => l === lane || f.hold.includes(l));
    if (lane === 'chars') {
      f.chars = [];
      f.rels = [];
    } else if (lane === 'bg') f.bg = null;
    else f.notes = f.notes.filter((n) => laneOfNote(n) !== lane);
  }
  loadActive(s, tl.active);
  return true;
}

/**
 * 自動打關鍵影格（原作的 tlAutoKey）：目前影格保持中的軌道，頂層和來源不同＝這一格這一條變成關鍵影格（鎖住的軌道不算）。
 * 回傳有沒有改。
 */
export function autoKey(s: Sheet): boolean {
  const tl = s.tl;
  if (!tl) return false;
  const k = tl.active;
  const f = tl.frames[k];
  if (!f || k === 0 || !f.hold.length) return false;
  let changed = false;
  for (const lane of [...f.hold]) {
    if (tl.locked.includes(lane)) continue;
    let same: boolean;
    if (lane === 'chars') {
      const src = laneChars(s, k);
      same =
        JSON.stringify(s.chars) === JSON.stringify(src.chars) &&
        JSON.stringify(s.rels) === JSON.stringify(src.rels);
    } else if (lane === 'bg') same = s.bg === laneBg(s, k);
    else
      same =
        JSON.stringify(s.notes.filter((n) => laneOfNote(n) === lane)) ===
        JSON.stringify(laneNotes(s, k, lane));
    if (!same) {
      f.hold = f.hold.filter((l) => l !== lane);
      changed = true;
    }
  }
  return changed;
}

/** 每格秒數（null＝自動；夾在 0.05～600、取到 0.01） */
export function clampDur(v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(DUR_MAX, Math.max(DUR_MIN, Math.round(v * 100) / 100));
}

/** 速度鈕的下一檔（0.5 → 0.75 → 1 → 1.5 → 2 → 3 → 0.5；不在檔位上＝1 的下一檔） */
export function nextSpeed(v: number): number {
  const L: readonly number[] = TL_SPEEDS;
  const i = L.indexOf(v);
  return L[(i < 0 ? L.indexOf(1) + 1 : i + 1) % L.length];
}

/**
 * 修改畫布尺寸、畫布貼合內容時其他影格一起平移（7.4 第 12 項）：角色、便利貼照同一個位移；
 * 畫布尺寸和目前影格原本相同的影格一起換成新的尺寸（各格尺寸不同時只平移）。
 */
export function shiftOtherFrames(
  s: Sheet,
  dx: number,
  dy: number,
  oldW: number,
  oldH: number,
): void {
  const tl = s.tl;
  if (!tl) return;
  tl.frames.forEach((f, k) => {
    if (k === tl.active) {
      f.W = s.W;
      f.H = s.H;
      return;
    }
    if (dx || dy) {
      for (const c of f.chars) {
        c.x += dx;
        c.y += dy;
      }
      for (const n of f.notes) {
        n.x += dx;
        n.y += dy;
      }
    }
    if (f.W === oldW && f.H === oldH) {
      f.W = s.W;
      f.H = s.H;
    }
  });
}
