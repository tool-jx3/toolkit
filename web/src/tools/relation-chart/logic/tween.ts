/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 時間軸的補間（F028；原作的 renderTweenAt）：位置 p（影格單位，0～格數 − 1）的「暫時分頁」＋覆寫表。
 * 編輯畫面的預覽、互動網頁預先算好的畫面、GIF／影片三處共用這一份（7.4；研究筆記附錄 C 第 2 項）；資料一律不改。
 * - 每條軌道各自找前一個、下一個關鍵影格，t＝easeInOutQuad((p − 前) ÷ (後 − 前))；沒有下一個＝不動。
 * - 角色：座標內插；換了變體＝交叉淡化（舊的 1 − t、新的 t；舊的那份 id 加 1e9）或「翻一次面」；
 *   變體相同但其他外觀不同（重要度、尺寸…）＝過半才換（原作一開始就換成下一格，7.4 第 4 項修掉）。
 * - 關係線：兩格都有＝過半才換成下一格的樣子（類型、備註、彎曲…；原作一開始就換，第 1 格的類型播放時看不到，D 項）。
 * - 只在一格出現的角色、關係、便利貼：前半段淡出 max(0, 1 − 2t)、後半段淡入 max(0, 2t − 1)（原作）。
 * - 便利貼：位置與寬高內插；文字不同＝交叉淡化（偏好開）或過半換字；圖表節點同範本同角色＝數值內插，否則交叉淡化。
 * - 畫布尺寸：用主時間的 t 內插；背景圖：兩格不同＝前一張留著、後一張淡入，只有一邊＝淡入或淡出。
 * - 補間關：直接畫最近的一格（round(p)）。
 */
import { CURVES, lerp } from '@/core/timeline';
import { variantOf } from '../model/library';
import { frameView, laneKeyIdx, laneNextKeyIdx, laneOfNote, ownData } from '../model/timeline';
import type { Char, CharEntry, Note, Rel, Sheet, TlFrame, TlLane } from '../model/types';

/** 交叉淡化時舊的那一份的暫時 id 位移（clipPath 等 id 不能撞號；原作的 TWEEN_ID_OFFSET） */
export const TWEEN_ID_OFFSET = 1e9;

/** 補間的覆寫表（畫法引擎讀；沒有的＝不透明、不翻面） */
export interface TweenFx {
  charOp: Map<number, number>;
  /** 翻轉動畫的橫向縮放（以角色中心為軸） */
  charFlip: Map<number, number>;
  relOp: Map<number, number>;
  noteOp: Map<number, number>;
  /** 圖表節點的內插數值：便利貼 id → 序列（a／b）→ 軸 id → 值 */
  noteVals: Map<number, Record<string, Record<string, number>>>;
  /** 背景圖的交叉淡化（null＝照分頁的 bg） */
  bg: { a: string | null; b: string | null; t: number } | null;
}

export interface TweenOpts {
  /** 補間關＝硬切換到最近的一格 */
  tweenOff?: boolean;
  /** 換變體時翻一次面（預設交叉淡化） */
  flip?: boolean;
  /** 便利貼文字交叉淡化（預設開；關＝過半換字） */
  noteFade?: boolean;
  /** 角色庫（圖表節點的數值內插用） */
  library?: readonly CharEntry[];
}

export interface TweenFrame {
  /** 要畫的暫時分頁（關係類型、設定、標籤…照原本的分頁） */
  sheet: Sheet;
  fx: TweenFx | null;
}

export const ease = CURVES.quadInOut;

const fadeOut = (t: number) => Math.max(0, 1 - t * 2);
const fadeIn = (t: number) => Math.max(0, t * 2 - 1);

/** 除了座標以外一樣嗎（角色：x、y；便利貼：x、y、w、h） */
function sameExcept<T extends object>(a: T, b: T, skip: readonly string[]): boolean {
  const pick = (o: T) => JSON.stringify(Object.entries(o).filter(([k]) => !skip.includes(k)));
  return pick(a) === pick(b);
}

const byId = <T extends { id: number }>(list: readonly T[]): Map<number, T> =>
  new Map(list.map((o) => [o.id, o]));

/** 一條軌道的這一段：前一個關鍵影格、下一個關鍵影格與比例（原作 seg） */
function seg(s: Sheet, i: number, p: number, lane: TlLane): { a: number; b: number; t: number } {
  const tl = s.tl as NonNullable<Sheet['tl']>;
  const ki = laneKeyIdx(tl, i, lane);
  const kj = laneNextKeyIdx(tl, i, lane);
  if (kj < 0) return { a: ki, b: ki, t: 0 };
  return { a: ki, b: kj, t: ease((p - ki) / (kj - ki)) };
}

/** 圖表節點兩邊的設定相同（範本、角色 A、B；原作 chartCfgSame） */
const chartCfgSame = (a: Note, b: Note) =>
  !!a.chart &&
  !!b.chart &&
  a.chart.tpl === b.chart.tpl &&
  a.chart.a === b.chart.a &&
  a.chart.b === b.chart.b;

/** 圖表節點在某一格畫的數值（a、b 各一組；原作 chartNoteVals） */
function chartVals(
  n: Note,
  chars: ReadonlyMap<number, Char>,
  library: readonly CharEntry[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const ch = n.chart;
  if (!ch) return out;
  const one = (id: number, idx: number, key: string) => {
    const c = id ? chars.get(id) : undefined;
    const v = c ? variantOf({ library: library as CharEntry[] }, c).variant : undefined;
    const list = v ? v.radars.filter((r) => r.tpl === ch.tpl) : [];
    if (!list.length) return;
    out[key] = { ...list[Math.min(idx, list.length - 1)].vals };
  };
  one(ch.a, ch.stA, 'a');
  if (ch.b) one(ch.b, ch.stB, 'b');
  return out;
}

/** 位置 p 的畫面 */
export function tweenAt(s: Sheet, p0: number, opts: TweenOpts = {}): TweenFrame {
  const tl = s.tl;
  if (!tl || tl.frames.length < 2) return { sheet: s, fx: null };
  const n = tl.frames.length;
  const p = Math.min(Math.max(0, p0), n - 1);
  if (opts.tweenOff) {
    const k = Math.min(n - 1, Math.max(0, Math.round(p)));
    return { sheet: { ...s, ...frameView(s, k) }, fx: null };
  }
  const i = Math.min(Math.floor(p), n - 2);
  const j = i + 1;
  const wT = ease(p - i);
  const fx: TweenFx = {
    charOp: new Map(),
    charFlip: new Map(),
    relOp: new Map(),
    noteOp: new Map(),
    noteVals: new Map(),
    bg: null,
  };
  /* 角色與關係 */
  const SC = seg(s, i, p, 'chars');
  const A = ownData(s, SC.a);
  const B = ownData(s, SC.b);
  let tt = SC.t;
  const ci = byId(A.chars);
  const cj = byId(B.chars);
  const chars: Char[] = [];
  const putChar = (
    c: Char,
    x: number | null,
    y: number | null,
    op: number,
    id?: number,
    flip?: number,
  ) => {
    const o = { ...c };
    if (x !== null) o.x = x;
    if (y !== null) o.y = y;
    if (id !== undefined) o.id = id;
    if (op < 1) fx.charOp.set(o.id, op);
    if (flip !== undefined) fx.charFlip.set(o.id, flip);
    chars.push(o);
  };
  for (const id of new Set([...ci.keys(), ...cj.keys()])) {
    const a = ci.get(id);
    const b = cj.get(id);
    if (a && b) {
      const x = lerp(a.x, b.x, tt);
      const y = lerp(a.y, b.y, tt);
      if (a.lib === b.lib && a.vari === b.vari)
        putChar(tt < 0.5 && !sameExcept(a, b, ['x', 'y']) ? a : b, x, y, 1);
      else if (opts.flip) {
        if (tt < 0.5) putChar(a, x, y, 1, undefined, Math.max(0.02, 1 - tt * 2));
        else putChar(b, x, y, 1, undefined, Math.max(0.02, tt * 2 - 1));
      } else {
        putChar(b, x, y, tt);
        putChar(a, x, y, 1 - tt, TWEEN_ID_OFFSET + id);
      }
    } else if (a) putChar(a, null, null, fadeOut(tt));
    else if (b) putChar(b, null, null, fadeIn(tt));
  }
  const ri = byId(A.rels);
  const rj = byId(B.rels);
  const rels: Rel[] = [];
  for (const id of new Set([...ri.keys(), ...rj.keys()])) {
    const a = ri.get(id);
    const b = rj.get(id);
    const r = a && b ? (tt < 0.5 ? a : b) : (a ?? b);
    if (!r) continue;
    const op = a && b ? 1 : a ? fadeOut(tt) : fadeIn(tt);
    if (op < 1) fx.relOp.set(r.id, op);
    rels.push(r);
  }
  /* 便利貼、圖表節點 */
  const notes: Note[] = [];
  const library = opts.library ?? [];
  const noteFade = opts.noteFade !== false;
  const putNote = (
    o0: Note,
    geo: Pick<Note, 'x' | 'y' | 'w' | 'h'> | null,
    op: number,
    id?: number,
  ) => {
    const o = geo ? { ...o0, ...geo } : { ...o0 };
    if (id !== undefined) o.id = id;
    if (op < 1) fx.noteOp.set(o.id, op);
    notes.push(o);
    return o;
  };
  for (const lane of ['notes', 'charts'] as const) {
    const SG = seg(s, i, p, lane);
    tt = SG.t;
    const FA = ownData(s, SG.a);
    const FB = ownData(s, SG.b);
    const ni = byId(FA.notes.filter((x) => laneOfNote(x) === lane));
    const nj = byId(FB.notes.filter((x) => laneOfNote(x) === lane));
    for (const id of new Set([...ni.keys(), ...nj.keys()])) {
      const a = ni.get(id);
      const b = nj.get(id);
      if (a && b) {
        const geo = {
          x: lerp(a.x, b.x, tt),
          y: lerp(a.y, b.y, tt),
          w: lerp(a.w, b.w, tt),
          h: lerp(a.h, b.h, tt),
        };
        const skip = ['x', 'y', 'w', 'h'];
        if (a.chart || b.chart) {
          if (chartCfgSame(a, b)) {
            const va = chartVals(a, byId(FA.chars), library);
            const vb = chartVals(b, byId(FB.chars), library);
            const mix: Record<string, Record<string, number>> = {};
            for (const key of Object.keys(vb)) {
              const L = va[key] ?? {};
              const R = vb[key];
              const o: Record<string, number> = {};
              for (const ax of new Set([...Object.keys(L), ...Object.keys(R)]))
                o[ax] = lerp(+(L[ax] ?? 0) || 0, +(R[ax] ?? 0) || 0, tt);
              mix[key] = o;
            }
            const sameLook = sameExcept({ ...a, chart: null }, { ...b, chart: null }, skip);
            const o = putNote(tt < 0.5 && !sameLook ? a : b, geo, 1);
            fx.noteVals.set(o.id, mix);
          } else {
            putNote(b, geo, tt);
            putNote(a, geo, 1 - tt, TWEEN_ID_OFFSET + id);
          }
        } else if (a.text === b.text) putNote(tt < 0.5 && !sameExcept(a, b, skip) ? a : b, geo, 1);
        else if (!noteFade) putNote(tt < 0.5 ? a : b, geo, 1);
        else {
          putNote(b, geo, tt);
          putNote(a, geo, 1 - tt, TWEEN_ID_OFFSET + id);
        }
      } else if (a) putNote(a, null, fadeOut(tt));
      else if (b) putNote(b, null, fadeIn(tt));
    }
  }
  /* 畫布尺寸、背景圖 */
  const fi = ownData(s, i);
  const fj = ownData(s, j);
  const SB = seg(s, i, p, 'bg');
  fx.bg = { a: ownData(s, SB.a).bg, b: ownData(s, SB.b).bg, t: SB.t };
  const sheet: Sheet = {
    ...s,
    W: lerp(fi.W, fj.W, wT),
    H: lerp(fi.H, fj.H, wT),
    chars,
    rels,
    notes,
    bg: fx.bg.a ?? fx.bg.b,
  };
  return { sheet, fx };
}

/** 所有影格中最大的畫布（GIF／影片的輸出尺寸，原作 tweenExportPlan） */
export function maxFrameSize(s: Sheet): { W: number; H: number } {
  const tl = s.tl;
  if (!tl) return { W: s.W, H: s.H };
  let W = 0;
  let H = 0;
  tl.frames.forEach((_f: TlFrame, k) => {
    const d = ownData(s, k);
    W = Math.max(W, d.W);
    H = Math.max(H, d.H);
  });
  return { W, H };
}
