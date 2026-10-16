/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼（F190）與圖表節點（F192f）的常數與資料整理（原作的 NOTE_GRID、noteSnap、sanitizeNotes、sanitizeNoteBin、
 * sanitizeChartCfg）；畫法在 engine/notes.ts。
 */
import type { Note, NoteBinItem, NoteChart } from './types';

/** 尺寸的格子（固定 50，不跟著「格線間距」：存檔的寬高是它的整數倍） */
export const NOTE_GRID = 50;
/** 頂端橫槓的高度（小圓鈕） */
export const NOTE_BAR = 28;
/** 新便利貼 4 × 4 格；圖表節點 8 × 8 格 */
export const NOTE_W_DEF = 200;
export const NOTE_H_DEF = 200;
export const CHART_NOTE_SIZE = 400;
/** 便利貼庫左欄的尺寸範本（2 × 2～10 × 10） */
export const NOTE_CELL_MIN = 2;
export const NOTE_CELL_MAX = 10;
/** 便利貼庫最多幾筆（超過丟最舊的） */
export const NOTE_BIN_MAX = 60;
/** 備忘錄上限（超過截斷） */
export const MEMO_MAX = 20000;
/** 世界觀的上限（淨化前的輸入上限同原作 200 KB；存的是淨化過的） */
export const LORE_MAX = 400000;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;

/** 寬高吸到 50 的倍數、至少 2 格（原作的 noteSnap） */
export function noteSnap(v: unknown, fallback: number): number {
  const n0 = num(v);
  const n = Math.round((Number.isFinite(n0) ? n0 : fallback) / NOTE_GRID) * NOTE_GRID;
  return Math.max(NOTE_GRID * 2, Math.min(100000, n));
}

/** 字級：≥ 1 才算有設（留空＝跟隨） */
export function noteSizeValue(v: unknown): number | null {
  const n = num(v);
  return Number.isFinite(n) && n >= 1 ? Math.min(2000, Math.round(n * 10) / 10) : null;
}

/** 便利貼設定、兩個字級欄位的上限 */
export const NOTE_FS_INPUT_MAX = 200;
/** 本分頁預設字級的下限（原作 GS_NUMS 的 defStickySize：min 6） */
export const STICKY_DEF_MIN = 6;

/**
 * 便利貼設定的「字級 px」欄：小於 1（含 0.5～0.99、0、負數）＝留空（跟隨）；
 * 捨去成整數（原作 openNotePanel 的 parseInt：1.5 → 1）；最多 200（7.11）。
 */
export function noteSizeInput(v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || v < 1) return null;
  return Math.min(NOTE_FS_INPUT_MAX, Math.floor(v));
}

/**
 * 便利貼設定的「本分頁預設字級」：小於 1＝0（自動）；1～5.x＝6（原作的最小值）；取到 0.1（原作讀回時的 numIn）；
 * 最多 200（7.11）。
 */
export function stickyDefaultInput(v: number | null): number {
  if (v === null || !Number.isFinite(v) || v < 1) return 0;
  return Math.min(NOTE_FS_INPUT_MAX, Math.max(STICKY_DEF_MIN, Math.round(v * 10) / 10));
}

/** 圖表節點的設定（原作 sanitizeChartCfg：不檢查範本在不在） */
export function normalizeNoteChart(raw: unknown): NoteChart | null {
  if (!isObj(raw) || !Number.isFinite(num(raw.tpl))) return null;
  const int = (v: unknown) => (Number.isFinite(num(v)) ? Math.trunc(num(v)) : 0);
  return {
    tpl: Math.trunc(num(raw.tpl)),
    a: int(raw.a),
    b: int(raw.b),
    stA: Math.max(0, int(raw.stA)),
    stB: Math.max(0, int(raw.stB)),
    legend: raw.legend !== false,
  };
}

/** 一張便利貼（文字欄位：本站 text、原作 name） */
export function normalizeNote(raw: unknown, fallbackId: number): Note | null {
  if (!isObj(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const text =
    typeof raw.text === 'string' ? raw.text : typeof raw.name === 'string' ? raw.name : '';
  return {
    id: Number.isFinite(num(raw.id)) ? Math.trunc(num(raw.id)) : fallbackId,
    text: text.slice(0, 20000),
    x: Number.isFinite(x) ? Math.round(x * 10) / 10 : 0,
    y: Number.isFinite(y) ? Math.round(y * 10) / 10 : 0,
    w: noteSnap(raw.w ?? raw.noteW, NOTE_W_DEF),
    h: noteSnap(raw.h ?? raw.noteH, NOTE_H_DEF),
    size: noteSizeValue(raw.size ?? raw.nameSize),
    locked: raw.locked === true,
    bare: raw.bare === true,
    chart: normalizeNoteChart(raw.chart),
  };
}

/** 便利貼庫的一筆 */
export function normalizeNoteBinItem(raw: unknown, fallbackId: number): NoteBinItem | null {
  const n = normalizeNote(raw, fallbackId);
  if (!n || !isObj(raw)) return null;
  const at = num(raw.savedAt);
  return {
    id: n.id,
    savedAt: Number.isFinite(at) && at > 0 ? Math.trunc(at) : 0,
    text: n.text,
    w: n.w,
    h: n.h,
    size: n.size,
    bare: n.bare,
    chart: n.chart,
  };
}

/** 關閉一張便利貼時存進庫的紀錄（不帶座標） */
export const noteToBin = (n: Note, id: number, savedAt: number): NoteBinItem => ({
  id,
  savedAt,
  text: n.text,
  w: n.w,
  h: n.h,
  size: n.size,
  bare: n.bare,
  chart: n.chart ? { ...n.chart } : null,
});

/** 紀錄的顯示名稱：第一個非空行（空白＝null，畫面寫「（空白便利貼）」） */
export function noteBinName(text: string): string | null {
  for (const ln of text.split('\n')) if (ln.trim()) return ln.trim();
  return null;
}
