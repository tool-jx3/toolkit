/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼與圖表節點的動作（原作的 addStickyNote、addChartNote、noteBarAction、noteBinPush、noteBinRestore、noteBinDelete、
 * snapNodeToGrid 的便利貼分支）。每個動作一步復原；拖曳、改大小、打字由呼叫端用手勢包成一步。
 */
import type { Draft } from 'immer';
import {
  CHART_NOTE_SIZE,
  NOTE_BIN_MAX,
  NOTE_CELL_MAX,
  NOTE_CELL_MIN,
  NOTE_GRID,
  NOTE_H_DEF,
  NOTE_W_DEF,
  noteSnap,
  noteToBin,
} from '../model/notes';
import type { Note, NoteChart, Project, Sheet } from '../model/types';
import { activeSheet, projectNow, updateProject, useUi } from './store';

type DProject = Draft<Project>;
const cur = (p: DProject) => p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
const gridStep = (s: Pick<Sheet, 'settings'>) =>
  s.settings.gridStep >= 10 && s.settings.gridStep <= 200 ? s.settings.gridStep : 50;

/** 對齊格線：便利貼吸「邊」（角色吸中心；奇數格的便利貼才貼得到畫布邊緣） */
export function snapNote(n: Pick<Note, 'x' | 'y' | 'w' | 'h'>, G: number): void {
  n.x = Math.round((n.x - n.w / 2) / G) * G + n.w / 2;
  n.y = Math.round((n.y - n.h / 2) / G) * G + n.h / 2;
}

function placeNew(s: Draft<Sheet>, n: Note, rand: () => number): void {
  const W = s.W || 1000;
  const H = s.H || W;
  n.x = W / 2 + (rand() - 0.5) * 80;
  n.y = H / 2 + (rand() - 0.5) * 80;
  if (s.settings.gridSnap) snapNote(n, gridStep(s));
}

const blank = (id: number): Note => ({
  id,
  text: '',
  x: 0,
  y: 0,
  w: NOTE_W_DEF,
  h: NOTE_H_DEF,
  size: null,
  locked: false,
  bare: false,
  chart: null,
});

/** 新增便利貼（cells＝邊長格數，便利貼庫的尺寸範本；沒給＝4 × 4）：畫布中央 ±40，不避開角色；回傳 id */
export function addNote(cells?: number, rand: () => number = Math.random): number {
  let id = 0;
  updateProject((p) => {
    const s = cur(p);
    const n = blank(p.nextId++);
    if (cells !== undefined && Number.isFinite(cells)) {
      const g = Math.max(NOTE_CELL_MIN, Math.min(NOTE_CELL_MAX, Math.round(cells)));
      n.w = g * NOTE_GRID;
      n.h = g * NOTE_GRID;
    }
    placeNew(s, n, rand);
    s.notes.push(n);
    id = n.id;
  });
  return id;
}

/** 新增圖表節點（8 × 8 格；範本＝指定的或第一份、A＝指定的或唯一選取的角色；回傳 id） */
export function addChartNote(
  cfg: { tpl?: number; a?: number | null; b?: number | null } = {},
  rand: () => number = Math.random,
): number {
  let id = 0;
  const sel = useUi.getState().sel;
  updateProject((p) => {
    const s = cur(p);
    const has = (cid: number | null | undefined) =>
      cid && s.chars.some((c) => c.id === cid) ? (cid as number) : 0;
    const tpl =
      cfg.tpl !== undefined && p.radarTpls.some((t) => t.id === cfg.tpl)
        ? cfg.tpl
        : (p.radarTpls[0]?.id ?? 0);
    const chart: NoteChart = {
      tpl,
      a: has(cfg.a) || (sel.length === 1 ? has(sel[0]) : 0),
      b: has(cfg.b),
      stA: 0,
      stB: 0,
      legend: true,
    };
    if (chart.b === chart.a) chart.b = 0;
    const n: Note = { ...blank(p.nextId++), w: CHART_NOTE_SIZE, h: CHART_NOTE_SIZE, chart };
    placeNew(s, n, rand);
    s.notes.push(n);
    id = n.id;
  });
  return id;
}

/** 改一張便利貼（目前分頁） */
export function updateNote(id: number, recipe: (n: Draft<Note>, s: Draft<Sheet>) => void): void {
  updateProject((p) => {
    const s = cur(p);
    const n = s.notes.find((x) => x.id === id);
    if (n) recipe(n, s);
  });
}

/** 拖曳：中心移到 (x, y)；「對齊格線」時邊吸格線；不夾在畫布內（可以放到畫布外當旁註） */
export function moveNote(id: number, x: number, y: number): void {
  updateNote(id, (n, s) => {
    n.x = Math.round(x * 10) / 10;
    n.y = Math.round(y * 10) / 10;
    if (s.settings.gridSnap) snapNote(n, gridStep(s));
  });
}

/** 改大小：左上角 (left, top) 固定，寬高＝游標到左上角的距離吸 50 的倍數、至少 100 */
export function resizeNote(id: number, left: number, top: number, px: number, py: number): void {
  updateNote(id, (n) => {
    n.w = noteSnap(px - left, NOTE_W_DEF);
    n.h = noteSnap(py - top, NOTE_H_DEF);
    n.x = left + n.w / 2;
    n.y = top + n.h / 2;
  });
}

/** ✕＝從畫布拿掉，內容放進便利貼庫（最新的在最前面、最多 60 筆）；不確認 */
export function closeNote(id: number): void {
  updateProject((p) => {
    const s = cur(p);
    const i = s.notes.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [n] = s.notes.splice(i, 1);
    p.noteBin.unshift(noteToBin(n as Note, p.nextId++, Date.now()));
    if (p.noteBin.length > NOTE_BIN_MAX) p.noteBin.length = NOTE_BIN_MAX;
  });
}

/** 便利貼庫：點一筆＝放回畫布（新 id、中央附近，並從紀錄移除；回收桶語意） */
export function restoreNote(binId: number, rand: () => number = Math.random): number {
  let id = 0;
  updateProject((p) => {
    const i = p.noteBin.findIndex((x) => x.id === binId);
    if (i < 0) return;
    const e = p.noteBin[i];
    const s = cur(p);
    const n: Note = {
      ...blank(p.nextId++),
      text: e.text,
      w: noteSnap(e.w, NOTE_W_DEF),
      h: noteSnap(e.h, NOTE_H_DEF),
      size: e.size,
      bare: e.bare,
      chart: e.chart ? { ...e.chart } : null,
    };
    placeNew(s, n, rand);
    p.noteBin.splice(i, 1);
    s.notes.push(n);
    id = n.id;
  });
  return id;
}

/** 便利貼庫的刪除模式：刪掉紀錄（不放回） */
export function deleteBinItem(binId: number): void {
  updateProject((p) => {
    p.noteBin = p.noteBin.filter((x) => x.id !== binId);
  });
}

export const noteNow = (id: number): Note | undefined =>
  activeSheet(projectNow()).notes.find((n) => n.id === id);
