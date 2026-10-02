/**
 * 場景的操作規則（不依賴 React）：貼上建立多個場景（3.2.13）、場景範本（3.2.14）、記住設定並貼上（F210）、
 * 同步房間設計（F190）、勾選的場景一起移動（F178、F179）。
 */
import { layoutTachie } from './geometry';
import {
  type Material,
  NAMES,
  newEntityId,
  type RoomDesign,
  type Scene,
  type SceneMarker,
  type SceneTemplate,
} from './model';

/* ---------- 貼上建立多個場景（3.2.13） ---------- */

/** 一行拆成欄：有 Tab 就以 Tab 分欄（不處理引號）；否則以逗號分欄，雙引號包住的欄位可以含逗號，`""` 是一個引號 */
export function splitCells(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 第一行第一欄是這些字時當成表頭略過（不分大小寫；繁中、英文，也認日文與韓文的同義字） */
export const HEADER_WORDS = [
  '場景名稱',
  '場景名',
  '名稱',
  '名字',
  '場景',
  'name',
  'scene',
  'scenename',
  'scene name',
  'シーン名',
  '名前',
  '씬 이름',
  '이름',
];

const isHeader = (s: string): boolean =>
  HEADER_WORDS.some((w) => w.toLowerCase() === s.toLowerCase());

/**
 * 用名稱找素材（3.2.13）：去掉副檔名、不分大小寫；依素材一覽順序，第一個「名稱完全相同」或
 * 「雜湊檔名主體相同」或「名稱包含這個字」的素材。找不到時 null。
 */
export function findMaterialByName(materials: readonly Material[], key: string): string | null {
  const k = String(key || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .trim();
  if (!k) return null;
  const hit = materials.find((m) => {
    const label = String(m.label || '').toLowerCase();
    const stem = m.name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
    return label === k || stem === k || (label !== '' && label.includes(k));
  });
  return hit ? hit.name : null;
}

export interface BulkSceneRow {
  name: string;
  text: string;
  foregroundUrl: string | null;
}

/** 貼上的文字 → 要建立的場景（逐行；空白行、場景名空白的行略過；第一行是表頭時略過；開頭的 BOM 去掉） */
export function parseBulkScenes(text: string, materials: readonly Material[]): BulkSceneRow[] {
  const out: BulkSceneRow[] = [];
  String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((line, li) => {
      if (!line.trim()) return;
      const cols = splitCells(line);
      const name = (cols[0] ?? '').trim();
      if (!name) return;
      if (li === 0 && isHeader(name)) return;
      out.push({
        name,
        text: (cols[1] ?? '').trim(),
        foregroundUrl: findMaterialByName(materials, cols[2] ?? ''),
      });
    });
  return out;
}

/* ---------- 複製（深拷貝＋新 id） ---------- */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 立繪與演出換新 id 的副本 */
export const cloneMarkers = (list: readonly SceneMarker[]): SceneMarker[] =>
  clone(list).map((m) => ({ ...m, id: newEntityId() }));

/** 場景的副本（插在原場景後面用；內容完整複製，名稱加複本後綴） */
export function duplicateScene(s: Scene): Scene {
  const c = clone(s);
  c.id = newEntityId();
  c.name = `${s.name}${NAMES.copySuffix}`;
  c.markers = c.markers.map((m) => ({ ...m, id: newEntityId() }));
  return c;
}

/* ---------- 場景範本（3.2.14） ---------- */

/** 登錄：前景、背景模式與個別背景、前景尺寸、自動裁切、格線、切換文字、共用部件差異、立繪與演出、切入的指定（名稱與備忘不存） */
export function templateFromScene(s: Scene, name: string): SceneTemplate {
  return {
    id: newEntityId(),
    name,
    foregroundUrl: s.foregroundUrl,
    backgroundMode: s.backgroundMode,
    backgroundUrl: s.backgroundUrl,
    fieldWidth: s.fieldWidth,
    fieldHeight: s.fieldHeight,
    autoCrop: s.autoCrop,
    displayGrid: s.displayGrid,
    text: s.text,
    overrides: clone(s.overrides),
    markers: clone(s.markers),
    cutinId: s.cutinId,
  };
}

/**
 * 套用範本（全部）：以上全部換成範本的值；keepForeground 時前景不換（範本沒有前景時也不換）。
 * 立繪與演出換新 id，套用後立繪重新等距排列。
 */
export function applyTemplate(
  tp: SceneTemplate,
  s: Scene,
  room: RoomDesign,
  gap: number,
  { keepForeground = false } = {},
): Scene {
  if (!keepForeground && tp.foregroundUrl) s.foregroundUrl = tp.foregroundUrl;
  s.backgroundUrl = tp.backgroundUrl || null;
  s.backgroundMode = tp.backgroundMode || 'room';
  s.fieldWidth = tp.fieldWidth;
  s.fieldHeight = tp.fieldHeight;
  s.autoCrop = tp.autoCrop;
  s.displayGrid = tp.displayGrid;
  s.text = tp.text || '';
  s.overrides = clone(tp.overrides || {});
  s.markers = cloneMarkers(tp.markers || []);
  s.cutinId = tp.cutinId;
  layoutTachie(s, room, gap);
  return s;
}

/* ---------- 記住設定並貼上（F208～F210） ---------- */

export type ClipKind = 'all' | 'tachie' | 'effect' | 'cutin' | 'overrides' | 'text' | 'image';

export interface SceneClip {
  id: string;
  name: string;
  foregroundUrl: string | null;
  backgroundMode: Scene['backgroundMode'];
  backgroundUrl: string | null;
  fieldWidth: number;
  fieldHeight: number;
  autoCrop: boolean;
  displayGrid: boolean;
  text: string;
  memo: string;
  overrides: Scene['overrides'];
  markers: SceneMarker[];
  cutinId: string | null;
}

export function clipFromScene(s: Scene): SceneClip {
  return clone({
    id: s.id,
    name: s.name,
    foregroundUrl: s.foregroundUrl,
    backgroundMode: s.backgroundMode,
    backgroundUrl: s.backgroundUrl,
    fieldWidth: s.fieldWidth,
    fieldHeight: s.fieldHeight,
    autoCrop: s.autoCrop,
    displayGrid: s.displayGrid,
    text: s.text,
    memo: s.memo,
    overrides: s.overrides,
    markers: s.markers,
    cutinId: s.cutinId,
  });
}

/**
 * 貼上（F210）：立繪＝目標原有的立繪換成來源的（演出保留）；演出＝原有演出換成來源的（立繪保留）；切入＝換成來源的指定；
 * 共用部件差異＝整組換成來源的；文字與備忘＝切換文字與備忘；前景與背景＝前景、背景模式、個別背景、前景尺寸、自動裁切、格線。
 * 全部＝以上全部。貼上的立繪與演出都給新 id；貼上後立繪重新等距排列。
 */
export function pasteClip(
  c: SceneClip,
  s: Scene,
  kind: ClipKind,
  room: RoomDesign,
  gap: number,
): void {
  const all = kind === 'all';
  if (all || kind === 'text') {
    s.text = c.text || '';
    s.memo = c.memo || '';
  }
  if (all || kind === 'image') {
    s.foregroundUrl = c.foregroundUrl || null;
    s.backgroundUrl = c.backgroundUrl || null;
    s.backgroundMode = c.backgroundMode || 'room';
    s.fieldWidth = c.fieldWidth;
    s.fieldHeight = c.fieldHeight;
    s.autoCrop = c.autoCrop;
    s.displayGrid = c.displayGrid;
  }
  if (all || kind === 'overrides') s.overrides = clone(c.overrides || {});
  if (all || kind === 'cutin') s.cutinId = c.cutinId;
  if (all || kind === 'tachie' || kind === 'effect') {
    const keep = s.markers.filter((m) =>
      kind === 'tachie' ? m.kind !== 'tachie' : kind === 'effect' ? m.kind === 'tachie' : false,
    );
    const add = cloneMarkers(
      c.markers.filter((m) =>
        kind === 'tachie' ? m.kind === 'tachie' : kind === 'effect' ? m.kind !== 'tachie' : true,
      ),
    );
    s.markers = [...keep, ...add];
  }
  layoutTachie(s, room, gap);
}

/* ---------- 同步房間設計（F190） ---------- */

/** 前景尺寸改成目前盤面、自動裁切開、格線＝房間設定（關）、清除所有共用部件的場景差異；其餘不變 */
export function syncSceneToRoom(s: Scene, room: RoomDesign): void {
  s.fieldWidth = room.fieldWidth;
  s.fieldHeight = room.fieldHeight;
  s.autoCrop = true;
  s.displayGrid = false;
  s.overrides = {};
}

/* ---------- 一起移動（F178、F179） ---------- */

/** 勾選的項目一起上移／下移一格（碰到頭尾就不動）；回傳新的順序 */
export function moveSelected<T extends { id: string }>(
  list: readonly T[],
  selected: ReadonlySet<string>,
  dir: -1 | 1,
): T[] {
  const out = [...list];
  if (dir < 0) {
    for (let i = 1; i < out.length; i++) {
      if (selected.has(out[i].id) && !selected.has(out[i - 1].id)) {
        [out[i - 1], out[i]] = [out[i], out[i - 1]];
      }
    }
  } else {
    for (let i = out.length - 2; i >= 0; i--) {
      if (selected.has(out[i].id) && !selected.has(out[i + 1].id)) {
        [out[i + 1], out[i]] = [out[i], out[i + 1]];
      }
    }
  }
  return out;
}

/** 勾選的項目移到最前／最後（保持彼此的順序） */
export function moveSelectedTo<T extends { id: string }>(
  list: readonly T[],
  selected: ReadonlySet<string>,
  where: 'top' | 'bottom',
): T[] {
  const sel = list.filter((x) => selected.has(x.id));
  const rest = list.filter((x) => !selected.has(x.id));
  return where === 'top' ? [...sel, ...rest] : [...rest, ...sel];
}

/** 拖曳排序（F179）：被拖的（勾選的整組）移到目標列之前 */
export function moveBefore<T extends { id: string }>(
  list: readonly T[],
  moving: ReadonlySet<string>,
  targetId: string,
): T[] {
  if (moving.has(targetId)) return [...list];
  const sel = list.filter((x) => moving.has(x.id));
  const rest = list.filter((x) => !moving.has(x.id));
  const at = rest.findIndex((x) => x.id === targetId);
  if (at < 0) return [...list];
  return [...rest.slice(0, at), ...sel, ...rest.slice(at)];
}

/* ---------- 批次改名（F056、F181） ---------- */

/** 一行一個名稱逐行對應：去頭尾空白，空行或與原名相同的不改；回傳 [索引, 新名稱] */
export function renamePairs(lines: string, current: readonly string[]): [number, string][] {
  const rows = String(lines).replace(/\r\n/g, '\n').split('\n');
  const out: [number, string][] = [];
  current.forEach((name, i) => {
    const v = (rows[i] ?? '').trim();
    if (v && v !== name) out.push([i, v]);
  });
  return out;
}

/** 依序編號（F059）：前綴＋起始號碼起算的編號（位數不足補 0） */
export function sequenceLabel(
  prefix: string,
  start: number,
  digits: number,
  index: number,
): string {
  const n = Math.max(0, Math.floor(start)) + index;
  return `${prefix}${String(n).padStart(Math.max(1, Math.min(4, Math.floor(digits))), '0')}`;
}
