/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 第三批「角色與關係的資料」的動作（每個動作一步復原）：
 * - 變體（編輯面板的衣櫃、統一顏色）、角色庫（加入本分頁、複製、刪除、新增變體、改名、排序）；
 * - 關係庫（加入本分頁、複製、刪除、新增變體、改名、排序）；
 * - 看法、角色資訊、頭像框庫、匯入的字型、數值圖表（範本、軸、狀態、數值）、交換位置、連線總表。
 * 原作的 addCharVariantToSheet、charLibCopy、charVariantCopy、charLibDelete、charVariantDelete、
 * addRelVariantToSheet、relLibCopy、relVariantCopy、relLibDelete、relVariantDelete、setView、
 * deleteRadarTpl、radarDropAxis、swapChars、連線總表的 commit。
 */
import type { Draft } from 'immer';
import { sheetCtx } from '../engine/geom';
import { nonOverlapping } from '../logic/layout';
import { makeChar, makeRel, makeType } from '../model/factory';
import { variantFrom, variantOf } from '../model/library';
import { RADAR_AXES_MAX, RADAR_AXES_MIN, viewText } from '../model/normalize';
import { allChars } from '../model/timeline';
import type {
  Char,
  CharEntry,
  FontItem,
  FontValue,
  FrameItem,
  Project,
  RadarTpl,
  Sheet,
  Variant,
} from '../model/types';
import { dropCharsFrom, relDup } from './actions';
import { projectNow, setUi, updateProject, useUi } from './store';

type DProject = Draft<Project>;
const take = (p: DProject): number => p.nextId++;
const cur = (p: DProject) => p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
const copyName = (n: string) => (n ? `${n}（變體）` : n);
const nextDefNo = (p: DProject): number => {
  const used = new Set(p.sheets.flatMap((s) => allChars(s as Sheet).map((c) => c.defNo)));
  let n = 1;
  while (used.has(n)) n++;
  return n;
};

/** 實例穿的變體（草稿） */
function variantDraft(p: DProject, charId: number) {
  const c = cur(p).chars.find((x) => x.id === charId);
  if (!c) return null;
  const e = p.library.find((x) => x.id === c.lib);
  const v = e?.variants.find((x) => x.id === c.vari) ?? e?.variants[0];
  return e && v ? { c, e, v } : null;
}

/* ---------- 變體（編輯面板） ---------- */

/** 換穿另一件變體（座標、關係不動） */
export function switchVariant(charId: number, varId: number): void {
  updateProject((p) => {
    const c = cur(p).chars.find((x) => x.id === charId);
    const e = c && p.library.find((x) => x.id === c.lib);
    if (!c || !e?.variants.some((v) => v.id === varId) || c.vari === varId) return;
    c.vari = varId;
  });
}

/** 新增變體（複製目前這件），立刻換穿；回傳新變體的 id */
export function newVariantFromChar(charId: number): number {
  let id = 0;
  updateProject((p) => {
    const x = variantDraft(p, charId);
    if (!x) return;
    id = take(p);
    const nv = variantFrom(x.v as Variant, id, x.v.radars);
    nv.name = copyName(nv.name);
    x.e.variants.push(nv);
    x.c.vari = id;
  });
  return id;
}

/** 確保是同一人（統一顏色）：打開時用目前這件的顏色蓋過所有變體；關掉＝之後各改各的（顏色不還原） */
export function setUnified(charId: number, on: boolean): void {
  updateProject((p) => {
    const x = variantDraft(p, charId);
    if (!x || x.e.unified === on) return;
    x.e.unified = on;
    if (on)
      for (const w of x.e.variants) {
        w.color = x.v.color;
        w.nameColor = x.v.nameColor;
      }
  });
}

/* ---------- 角色庫 ---------- */

/** 把一件變體加到目前分頁（沒給變體＝主要那件）：新的實例、重要度 0、畫布中央附近不重疊；回傳新角色的 id */
export function addEntryToSheet(
  entryId: number,
  varId?: number,
  rand: () => number = Math.random,
): number {
  let id = 0;
  updateProject((p) => {
    const e = p.library.find((x) => x.id === entryId);
    const v = (varId !== undefined && e?.variants.find((x) => x.id === varId)) || e?.variants[0];
    if (!e || !v) return;
    const s = cur(p);
    const ctx = sheetCtx(s as Sheet, p.labels);
    const pos = nonOverlapping(
      ctx,
      ctx.W / 2 + (rand() - 0.5) * 80,
      ctx.H / 2 + (rand() - 0.5) * 80,
      null,
    );
    id = take(p);
    /* 外觀欄位由同步從變體拉過來 */
    s.chars.push(
      makeChar(id, v.name, pos.x, pos.y, { lib: e.id, vari: v.id, defNo: nextDefNo(p) }),
    );
  });
  return id;
}

/** 複製條目（照抄：所有變體、統一顏色、角色資訊、角色字型；主要變體的名字加「（變體）」；插在原條目後面） */
export function copyEntry(entryId: number): number {
  let id = 0;
  updateProject((p) => {
    const i = p.library.findIndex((x) => x.id === entryId);
    if (i < 0) return;
    const e = p.library[i];
    id = take(p);
    const ne: CharEntry = {
      id,
      unified: e.unified,
      info: e.info,
      font: e.font,
      variants: e.variants.map((v) => variantFrom(v as Variant, take(p), v.radars)),
    };
    if (ne.variants[0]) ne.variants[0].name = copyName(ne.variants[0].name);
    p.library.splice(i + 1, 0, ne);
  });
  return id;
}

/** 複製一件變體（插在它後面，名字加「（變體）」） */
export function copyVariant(entryId: number, varId: number): number {
  let id = 0;
  updateProject((p) => {
    const e = p.library.find((x) => x.id === entryId);
    const i = e?.variants.findIndex((v) => v.id === varId) ?? -1;
    if (!e || i < 0) return;
    id = take(p);
    const nv = variantFrom(e.variants[i] as Variant, id, e.variants[i].radars);
    nv.name = copyName(nv.name);
    e.variants.splice(i + 1, 0, nv);
  });
  return id;
}

/** 詳情的「新增變體」：複製主要（第一件）外觀，加在最後 */
export function addLibVariant(entryId: number): number {
  const e = projectNow().library.find((x) => x.id === entryId);
  if (!e?.variants[0]) return 0;
  let id = 0;
  updateProject((p) => {
    const d = p.library.find((x) => x.id === entryId);
    if (!d?.variants[0]) return;
    id = take(p);
    const nv = variantFrom(d.variants[0] as Variant, id, d.variants[0].radars);
    nv.name = copyName(nv.name);
    d.variants.push(nv);
  });
  return id;
}

/** 變體改名（可以清空；穿這件的所有分頁一起變） */
export function renameVariant(entryId: number, varId: number, name: string): void {
  updateProject((p) => {
    const v = p.library.find((x) => x.id === entryId)?.variants.find((x) => x.id === varId);
    if (v) v.name = name.trim().slice(0, 500);
  });
}

/** 刪除條目：所有分頁上穿這個條目的角色與他們的關係一起刪（不確認，可以復原） */
export function deleteEntries(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  updateProject((p) => {
    for (const s of p.sheets) {
      const rm = new Set(
        allChars(s as Sheet)
          .filter((c) => set.has(c.lib))
          .map((c) => c.id),
      );
      if (rm.size) dropCharsFrom(s, rm, true);
    }
    p.library = p.library.filter((e) => !set.has(e.id));
  });
  afterDelete();
}

/** 刪除變體（只剩一件時不動）：穿這件的角色改穿第一件 */
export function deleteVariant(entryId: number, varId: number): void {
  updateProject((p) => {
    const e = p.library.find((x) => x.id === entryId);
    if (!e || e.variants.length <= 1 || !e.variants.some((v) => v.id === varId)) return;
    e.variants = e.variants.filter((v) => v.id !== varId);
    for (const s of p.sheets)
      for (const c of allChars(s as Sheet))
        if (c.lib === entryId && c.vari === varId) c.vari = e.variants[0].id;
  });
}

/** 在一組條目（分組、搜尋結果）裡換順序：這組佔的位置不變，只換誰坐哪一格 */
export function reorderIn<T extends { id: number }>(
  list: T[],
  groupIds: readonly number[],
  from: number,
  to: number,
) {
  if (from === to || from < 0 || to < 0 || from >= groupIds.length || to >= groupIds.length)
    return list;
  const ids = [...groupIds];
  const [m] = ids.splice(from, 1);
  ids.splice(to, 0, m);
  const byId = new Map(list.map((x) => [x.id, x]));
  const slots = groupIds
    .map((id) => list.findIndex((x) => x.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (slots.length !== ids.length) return list;
  const next = [...list];
  slots.forEach((slot, k) => {
    const x = byId.get(ids[k]);
    if (x) next[slot] = x;
  });
  return next;
}

export function reorderEntries(groupIds: readonly number[], from: number, to: number): void {
  updateProject((p) => {
    p.library = reorderIn(p.library as CharEntry[], groupIds, from, to);
  });
}

/* ---------- 關係庫 ---------- */

/** 這張分頁已經有這件關係變體了嗎 */
export const relVariantOnSheet = (
  s: Pick<Sheet, 'types'>,
  entryId: number,
  varId: number,
): boolean => s.types.some((t) => t.lib === entryId && t.vari === varId);

/** 把一件關係變體加到目前分頁（同一件已經在這張分頁＝不重複加，回傳 0） */
export function addRelVariantToSheet(entryId: number, varId?: number): number {
  let id = 0;
  updateProject((p) => {
    const e = p.relLibrary.find((x) => x.id === entryId);
    const v = (varId !== undefined && e?.variants.find((x) => x.id === varId)) || e?.variants[0];
    const s = cur(p);
    if (!e || !v || relVariantOnSheet(s, e.id, v.id)) return;
    id = take(p);
    s.types.push(
      makeType(id, v.label, {
        lib: e.id,
        vari: v.id,
        color: v.color,
        outlineColor: v.outlineColor,
        lineStyle: v.lineStyle,
        capStyle: v.capStyle,
        lineW: v.lineW,
        outlineW: v.outlineW,
        mag: v.mag,
      }),
    );
  });
  return id;
}

export function copyRelEntry(entryId: number): number {
  let id = 0;
  updateProject((p) => {
    const i = p.relLibrary.findIndex((x) => x.id === entryId);
    if (i < 0) return;
    id = take(p);
    const variants = p.relLibrary[i].variants.map((v) => ({
      ...JSON.parse(JSON.stringify(v)),
      id: take(p),
    }));
    if (variants[0]) variants[0].label = copyName(variants[0].label);
    p.relLibrary.splice(i + 1, 0, { id, variants });
  });
  return id;
}

export function copyRelVariant(entryId: number, varId: number): number {
  let id = 0;
  updateProject((p) => {
    const e = p.relLibrary.find((x) => x.id === entryId);
    const i = e?.variants.findIndex((v) => v.id === varId) ?? -1;
    if (!e || i < 0) return;
    id = take(p);
    const nv = { ...JSON.parse(JSON.stringify(e.variants[i])), id };
    nv.label = copyName(nv.label);
    e.variants.splice(i + 1, 0, nv);
  });
  return id;
}

export function addRelLibVariant(entryId: number): number {
  let id = 0;
  updateProject((p) => {
    const e = p.relLibrary.find((x) => x.id === entryId);
    if (!e?.variants[0]) return;
    id = take(p);
    const nv = { ...JSON.parse(JSON.stringify(e.variants[0])), id };
    nv.label = copyName(nv.label);
    e.variants.push(nv);
  });
  return id;
}

/** 關係變體改名（空白＝不改；穿這件的所有分頁一起改） */
export function renameRelVariant(entryId: number, varId: number, label: string): void {
  const t = label.trim().slice(0, 200);
  if (!t) return;
  updateProject((p) => {
    const v = p.relLibrary.find((x) => x.id === entryId)?.variants.find((x) => x.id === varId);
    if (v) v.label = t;
  });
}

/** 刪除關係條目：所有分頁穿這個條目任何一件的關係類型、它們的線與群體關係一起刪 */
export function deleteRelEntries(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  updateProject((p) => {
    for (const s of p.sheets) {
      const rm = new Set(s.types.filter((t) => set.has(t.lib)).map((t) => t.id));
      if (!rm.size) continue;
      s.types = s.types.filter((t) => !rm.has(t.id));
      s.rels = s.rels.filter((r) => !rm.has(r.type));
      for (const f of s.tl?.frames ?? []) f.rels = f.rels.filter((r) => !rm.has(r.type));
      s.grels = s.grels.filter((g) => !rm.has(g.type));
    }
    p.relLibrary = p.relLibrary.filter((e) => !set.has(e.id));
  });
  const u = useUi.getState();
  if (u.link && !projectNow().sheets.some((s) => s.types.some((t) => t.id === u.link?.typeId)))
    setUi({ link: null });
  afterDelete();
}

/** 刪除關係變體（只剩一件時不動）：用這件的關係類型保留樣式、解除綁定 */
export function deleteRelVariant(entryId: number, varId: number): void {
  updateProject((p) => {
    const e = p.relLibrary.find((x) => x.id === entryId);
    if (!e || e.variants.length <= 1 || !e.variants.some((v) => v.id === varId)) return;
    e.variants = e.variants.filter((v) => v.id !== varId);
    for (const s of p.sheets)
      for (const t of s.types)
        if (t.lib === entryId && t.vari === varId) {
          t.lib = 0;
          t.vari = 0;
        }
  });
}

export function reorderRelEntries(groupIds: readonly number[], from: number, to: number): void {
  updateProject((p) => {
    p.relLibrary = reorderIn(p.relLibrary as Project['relLibrary'], groupIds, from, to);
  });
}

/* ---------- 看法、角色資訊 ---------- */

/** 寫看法（清空＝刪除；不能對自己寫） */
export function setView(speaker: number, target: number, text: string): void {
  const t = viewText(text);
  if (speaker === target) return;
  updateProject((p) => {
    const s = cur(p);
    const a = String(speaker);
    const b = String(target);
    if (!t) {
      if (s.views[a]?.[b] === undefined) return;
      delete s.views[a][b];
      if (!Object.keys(s.views[a]).length) delete s.views[a];
      return;
    }
    if (s.views[a]?.[b] === t) return;
    s.views[a] = s.views[a] ?? {};
    s.views[a][b] = t;
  });
}

/** 角色資訊（條目層級；HTML 由呼叫端淨化過） */
export function setCharInfo(entryId: number, html: string): void {
  updateProject((p) => {
    const e = p.library.find((x) => x.id === entryId);
    if (e && e.info !== html) e.info = html;
  });
}

/* ---------- 頭像框庫 ---------- */

/** 加入頭像框（同一張圖只存一份）；回傳加入的與重複的數量 */
export function addFrames(items: readonly FrameItem[]): { added: number; dup: number } {
  const have = new Set(projectNow().frames.map((f) => f.id));
  const fresh: FrameItem[] = [];
  let dup = 0;
  for (const it of items) {
    if (have.has(it.id)) {
      dup++;
      continue;
    }
    have.add(it.id);
    fresh.push({ id: it.id, name: it.name.slice(0, 60) });
  }
  if (fresh.length)
    updateProject((p) => {
      p.frames.push(...fresh);
    });
  return { added: fresh.length, dup };
}

export function renameFrame(id: string, name: string): void {
  const n = name.trim().slice(0, 60);
  if (!n) return;
  updateProject((p) => {
    const f = p.frames.find((x) => x.id === id);
    if (f) f.name = n;
  });
}

/**
 * 刪除頭像框：指定這張的變體改回「跟隨標籤」（照原作；確認文字照實寫）、標籤的框拿掉、
 * 各分頁的預設框清掉（原作漏了：刪掉再上傳同一張，預設框又冒出來）
 */
export function deleteFrame(id: string): void {
  updateProject((p) => {
    p.frames = p.frames.filter((f) => f.id !== id);
    for (const e of p.library) for (const v of e.variants) if (v.frame === id) v.frame = null;
    for (const l of p.labels) if (l.frame === id) l.frame = '';
    for (const s of p.sheets) if (s.settings.defFrame === id) s.settings.defFrame = '';
  });
}

/* ---------- 匯入的字型 ---------- */

export function addFonts(items: readonly FontItem[]): { added: number; dup: number } {
  const have = new Set(projectNow().fonts.map((f) => f.id));
  const fresh: FontItem[] = [];
  let dup = 0;
  for (const it of items) {
    if (have.has(it.id)) {
      dup++;
      continue;
    }
    have.add(it.id);
    fresh.push({ ...it, name: it.name.slice(0, 100) });
  }
  if (fresh.length)
    updateProject((p) => {
      p.fonts.push(...fresh);
    });
  return { added: fresh.length, dup };
}

/** 刪除字型：文件字型用它＝回到黑體；角色字型用它＝跟隨文件字型 */
export function deleteFont(id: string): void {
  const ref = `f:${id}`;
  updateProject((p) => {
    p.fonts = p.fonts.filter((f) => f.id !== id);
    if (p.font === ref) p.font = 'sans';
    for (const e of p.library) if (e.font === ref) e.font = '';
  });
}

export function setDocFont(v: FontValue): void {
  updateProject((p) => {
    p.font = v;
  });
}

/* ---------- 數值圖表 ---------- */

/** 新範本：名稱空白、5 軸（上限 100）、雷達圖、多邊形、4 環、原始值、不共用刻度；回傳 id */
export function addRadarTpl(): number {
  let id = 0;
  updateProject((p) => {
    id = take(p);
    const axes = Array.from({ length: 5 }, () => ({ id: take(p), label: '', max: 100, unit: '' }));
    p.radarTpls.push({
      id,
      name: '',
      chart: 'radar',
      shape: 'poly',
      rings: 4,
      valMode: 'raw',
      shared: false,
      axes,
    });
  });
  return id;
}

export function updateRadarTpl(id: number, recipe: (t: Draft<RadarTpl>) => void): void {
  updateProject((p) => {
    const t = p.radarTpls.find((x) => x.id === id);
    if (t) recipe(t);
  });
}

/** 刪除範本：所有變體在這份範本的數值一起清 */
export function deleteRadarTpl(id: number): void {
  updateProject((p) => {
    p.radarTpls = p.radarTpls.filter((t) => t.id !== id);
    for (const e of p.library)
      for (const v of e.variants)
        if (v.radars.some((r) => r.tpl === id)) v.radars = v.radars.filter((r) => r.tpl !== id);
  });
}

export function addRadarAxis(tplId: number): number {
  let id = 0;
  updateProject((p) => {
    const t = p.radarTpls.find((x) => x.id === tplId);
    if (!t || t.axes.length >= RADAR_AXES_MAX) return;
    id = take(p);
    t.axes.push({ id, label: '', max: 100, unit: '' });
  });
  return id;
}

/** 刪一條軸（剩 3 軸時不動）：所有變體在這份範本的那一軸數值一起刪 */
export function deleteRadarAxis(tplId: number, axisId: number): void {
  updateProject((p) => {
    const t = p.radarTpls.find((x) => x.id === tplId);
    if (!t || t.axes.length <= RADAR_AXES_MIN) return;
    t.axes = t.axes.filter((a) => a.id !== axisId);
    const k = String(axisId);
    for (const e of p.library)
      for (const v of e.variants)
        for (const r of v.radars) if (r.tpl === tplId && k in r.vals) delete r.vals[k];
  });
}

/** 一位角色（目前這件變體）在一份範本的第 i 個狀態 */
function stateOf(v: Draft<Variant>, tplId: number, idx: number) {
  return v.radars.filter((r) => r.tpl === tplId)[idx];
}

/** 新增狀態（空的）；回傳它是這份範本的第幾個 */
export function addRadarState(charId: number, tplId: number): number {
  let idx = -1;
  updateProject((p) => {
    const x = variantDraft(p, charId);
    if (!x) return;
    x.v.radars.push({ tpl: tplId, state: '', vals: {} });
    idx = x.v.radars.filter((r) => r.tpl === tplId).length - 1;
  });
  return idx;
}

export function setRadarStateName(charId: number, tplId: number, idx: number, name: string): void {
  updateProject((p) => {
    const x = variantDraft(p, charId);
    const st = x && stateOf(x.v, tplId, idx);
    if (st) st.state = name.slice(0, 100);
  });
}

export function deleteRadarState(charId: number, tplId: number, idx: number): void {
  updateProject((p) => {
    const x = variantDraft(p, charId);
    const st = x && stateOf(x.v, tplId, idx);
    if (x && st) x.v.radars = x.v.radars.filter((r) => r !== st);
  });
}

/** 填數值（null＝清掉這一軸；不夾上限，畫的時候才夾） */
export function setRadarVal(
  charId: number,
  tplId: number,
  idx: number,
  axisId: number,
  value: number | null,
): void {
  updateProject((p) => {
    const x = variantDraft(p, charId);
    if (!x) return;
    let st = stateOf(x.v, tplId, idx);
    if (!st) {
      if (idx !== 0) return;
      x.v.radars.push({ tpl: tplId, state: '', vals: {} });
      st = stateOf(x.v, tplId, 0);
    }
    const k = String(axisId);
    if (value === null || !Number.isFinite(value)) delete st.vals[k];
    else st.vals[k] = value;
  });
}

/* ---------- 交換位置（F061） ---------- */

/** 兩人交換座標與清單裡的順序（排列照清單順序落位；釘選的也能換） */
export function swapChars(a: number, b: number): void {
  if (a === b) return;
  updateProject((p) => {
    const s = cur(p);
    const i = s.chars.findIndex((c) => c.id === a);
    const j = s.chars.findIndex((c) => c.id === b);
    if (i < 0 || j < 0) return;
    const A = s.chars[i];
    const B = s.chars[j];
    const ax = A.x;
    const ay = A.y;
    A.x = B.x;
    A.y = B.y;
    B.x = ax;
    B.y = ay;
    s.chars[i] = B;
    s.chars[j] = A;
  });
}

/* ---------- 連線總表（F094） ---------- */

/** 新增一條關係（同兩人同類已有＝'dup'；來源＝目標＝自我關係，雙向一律關）；回傳新的 id */
export function addRelation(from: number, to: number, type: number, both: boolean): number | 'dup' {
  const s = projectNow().sheets[Math.min(projectNow().sheets.length - 1, projectNow().active)];
  const self = from === to;
  if (relDup(s.rels, null, from, to, type, self ? false : both)) return 'dup';
  let id = 0;
  updateProject((p) => {
    id = take(p);
    cur(p).rels.push(makeRel(id, from, to, type, { both: self ? false : both }));
  });
  return id;
}

/** 批次換關係類型：已經是這一種的算已套用；會變成重複的略過 */
export function retagRels(
  ids: readonly number[],
  type: number,
): { applied: number; skipped: number } {
  const s = projectNow().sheets[Math.min(projectNow().sheets.length - 1, projectNow().active)];
  const want = new Set(ids);
  const next = s.rels.map((r) => ({ ...r }));
  let applied = 0;
  let skipped = 0;
  const changed = new Set<number>();
  for (const r of next) {
    if (!want.has(r.id)) continue;
    if (r.type === type) {
      applied++;
      continue;
    }
    if (relDup(next, r.id, r.from, r.to, type, r.both)) {
      skipped++;
      continue;
    }
    r.type = type;
    changed.add(r.id);
    applied++;
  }
  if (changed.size)
    updateProject((p) => {
      for (const r of cur(p).rels) if (changed.has(r.id)) r.type = type;
    });
  return { applied, skipped };
}

export function deleteRels(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  updateProject((p) => {
    const s = cur(p);
    s.rels = s.rels.filter((r) => !set.has(r.id));
  });
  afterDelete();
}

/* ---------- 共用 ---------- */

/** 刪掉之後：畫面上指到不見的東西的選取、聚焦、面板清掉 */
function afterDelete(): void {
  const p = projectNow();
  const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
  const ids = new Set(s.chars.map((c) => c.id));
  const relIds = new Set(s.rels.map((r) => r.id));
  const typeIds = new Set(s.types.map((t) => t.id));
  const u = useUi.getState();
  const ok = (f: { kind: string; id?: number } | null) =>
    !f ||
    ((f.kind === 'node' || f.kind === 'char') && ids.has(f.id as number)) ||
    ((f.kind === 'edge' || f.kind === 'rel') && relIds.has(f.id as number)) ||
    (f.kind === 'type' && typeIds.has(f.id as number)) ||
    !['node', 'char', 'edge', 'rel', 'type'].includes(f.kind);
  setUi({
    sel: u.sel.filter((id) => ids.has(id)),
    focus: ok(u.focus) ? u.focus : null,
    hover: ok(u.hover) ? u.hover : null,
    panel: ok(u.panel as { kind: string; id?: number } | null) ? u.panel : null,
  });
}

/* ---------- 查詢（畫面用） ---------- */

/** 實例穿的變體與條目（目前的專案） */
export const charVariant = (c: Pick<Char, 'lib' | 'vari'>) => variantOf(projectNow(), c);
