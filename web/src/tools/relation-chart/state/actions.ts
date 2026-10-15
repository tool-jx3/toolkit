/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 專案的修改（原作的新增角色、批次建立、複製、刪除、關係類型、建立關係模式、關係線的編輯、分頁、排列…）。
 * 每個動作是一步復原（拖曳、滑桿、文字欄由呼叫端用手勢包成一步）。
 */
import type { Draft } from 'immer';
import { charRadius, displayName, sheetCtx } from '../engine/geom';
import { type AlignAction, applyAlign } from '../logic/align';
import {
  applyLayout,
  fitCanvasToContent,
  nonOverlapping,
  reorderKeepSlots,
  separateAll,
  shuffleSeats,
} from '../logic/layout';
import { type ParsedTable, planImport } from '../logic/table';
import {
  copyName,
  copyTypeLabel,
  makeChar,
  makeRel,
  makeType,
  unnamedTypeLabel,
} from '../model/factory';
import { emptySheet, newSettings, normalizeSheet, smallestFree } from '../model/normalize';
import type {
  Avatar,
  Char,
  LayoutKind,
  Project,
  Rel,
  RelType,
  Sheet,
  SheetSettings,
} from '../model/types';
import {
  activeIndex,
  activeSheet,
  projectNow,
  setUi,
  updateProject,
  useProject,
  useUi,
} from './store';

/* ---------- 共用 ---------- */

type DSheet = Draft<Sheet>;
type DProject = Draft<Project>;

/** 改目前的分頁 */
export function editSheet(recipe: (s: DSheet, p: DProject) => void): void {
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (s) recipe(s, p);
  });
}

const takeId = (p: DProject): number => p.nextId++;

/** 全專案未用的角色預設編號 */
const nextCharDefNo = (p: Project | DProject): number =>
  smallestFree(p.sheets.flatMap((s) => s.chars.map((c) => c.defNo)));
const nextSheetDefNo = (p: Project | DProject): number =>
  smallestFree(p.sheets.map((s) => s.defNo));

const ctxOf = (s: DSheet) => sheetCtx(s as Sheet);

/** 只在畫面上有的東西（選取、聚焦、面板）跟著刪掉的內容一起清 */
function pruneUi(): void {
  const s = activeSheet();
  const ids = new Set(s.chars.map((c) => c.id));
  const relIds = new Set(s.rels.map((r) => r.id));
  const typeIds = new Set(s.types.map((t) => t.id));
  const u = useUi.getState();
  const sel = u.sel.filter((id) => ids.has(id));
  const alive = (f: { kind: string; id: number } | null) =>
    !f ||
    (f.kind === 'node' && ids.has(f.id)) ||
    (f.kind === 'edge' && relIds.has(f.id)) ||
    (f.kind === 'type' && typeIds.has(f.id)) ||
    (f.kind === 'char' && ids.has(f.id)) ||
    (f.kind === 'rel' && relIds.has(f.id));
  const link =
    u.link && typeIds.has(u.link.typeId)
      ? { ...u.link, from: u.link.from !== null && ids.has(u.link.from) ? u.link.from : null }
      : null;
  setUi({
    sel: sel.length === u.sel.length ? u.sel : sel,
    focus: alive(u.focus) ? u.focus : null,
    hover: alive(u.hover) ? u.hover : null,
    panel: alive(u.panel) ? u.panel : null,
    link,
  });
}

/** 復原／重做之後也要清（復原可能讓選取的角色不見） */
useProject.temporal.subscribe(() => queueMicrotask(pruneUi));

/* ---------- 分頁 ---------- */

export function switchSheet(idx: number): void {
  const p = projectNow();
  if (idx === activeIndex(p) || idx < 0 || idx >= p.sheets.length) return;
  updateProject((d) => {
    d.active = idx;
  });
  const u = useUi.getState();
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    panel: null,
    renaming: null,
    fitTick: u.fitTick + 1,
  });
}

/** 新增分頁（copy＝複製目前的分頁；角色各自獨立，D5） */
export function addSheet(copy: boolean): void {
  updateProject((p) => {
    const cur = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const id = takeId(p);
    const defNo = nextSheetDefNo(p);
    let sheet: Sheet;
    if (copy) {
      const snap = JSON.parse(JSON.stringify(cur)) as Sheet;
      const charMap = new Map<number, number>();
      const typeMap = new Map<number, number>();
      const used = new Set(p.sheets.flatMap((s) => s.chars.map((c) => c.defNo)));
      for (const c of snap.chars) {
        const nid = takeId(p);
        charMap.set(c.id, nid);
        c.id = nid;
        if (!c.name) {
          c.defNo = smallestFree(used);
          used.add(c.defNo);
        }
      }
      for (const t of snap.types) {
        const nid = takeId(p);
        typeMap.set(t.id, nid);
        t.id = nid;
      }
      for (const r of snap.rels) {
        r.id = takeId(p);
        r.from = charMap.get(r.from) ?? r.from;
        r.to = charMap.get(r.to) ?? r.to;
        r.type = typeMap.get(r.type) ?? r.type;
      }
      sheet = { ...snap, id, defNo, name: '' };
    } else {
      sheet = emptySheet(id, defNo, {
        W: cur.W,
        H: cur.H,
        settings: newSettings(cur.settings as SheetSettings),
      });
    }
    p.sheets.push(sheet);
    p.active = p.sheets.length - 1;
  });
  const u = useUi.getState();
  setUi({ sel: [], focus: null, hover: null, link: null, panel: null, fitTick: u.fitTick + 1 });
}

export function renameSheet(idx: number, name: string): void {
  updateProject((p) => {
    const s = p.sheets[idx];
    if (s) s.name = name.trim().slice(0, 200);
  });
}

/** 刪除分頁（只剩一張時不能刪） */
export function deleteSheet(idx: number): boolean {
  const p = projectNow();
  if (p.sheets.length <= 1 || !p.sheets[idx]) return false;
  updateProject((d) => {
    d.sheets.splice(idx, 1);
    if (d.active >= d.sheets.length) d.active = d.sheets.length - 1;
    else if (d.active > idx) d.active--;
  });
  const u = useUi.getState();
  setUi({ sel: [], focus: null, hover: null, link: null, panel: null, fitTick: u.fitTick + 1 });
  return true;
}

export function moveSheet(from: number, to: number): void {
  updateProject((p) => {
    if (from === to || !p.sheets[from] || to < 0 || to >= p.sheets.length) return;
    const activeId = p.sheets[p.active]?.id;
    const [s] = p.sheets.splice(from, 1);
    p.sheets.splice(to, 0, s);
    p.active = Math.max(
      0,
      p.sheets.findIndex((x) => x.id === activeId),
    );
  });
}

/**
 * 把一張用區域 id 寫的分頁加進專案（範例、原作的專案檔），id 換成專案的；回傳新分頁的索引。
 * mapChar：舊角色 id → 新 id（原作的頭像對應用）。
 */
export function insertSheet(
  p: DProject,
  src: Sheet,
  opts: { keepName?: boolean; mapChar?: Map<number, number>; labelMap?: Map<number, number> } = {},
): number {
  const snap = JSON.parse(JSON.stringify(src)) as Sheet;
  const charMap = opts.mapChar ?? new Map<number, number>();
  const typeMap = new Map<number, number>();
  const used = new Set(p.sheets.flatMap((s) => s.chars.map((c) => c.defNo)));
  for (const c of snap.chars) {
    const nid = takeId(p);
    charMap.set(c.id, nid);
    c.id = nid;
    if (!c.defNo || used.has(c.defNo)) c.defNo = smallestFree(used);
    used.add(c.defNo);
    if (opts.labelMap)
      c.labels = c.labels.map((l) => opts.labelMap?.get(l) ?? -1).filter((l) => l > 0);
  }
  for (const t of snap.types) {
    const nid = takeId(p);
    typeMap.set(t.id, nid);
    t.id = nid;
  }
  for (const r of snap.rels) {
    r.id = takeId(p);
    r.from = charMap.get(r.from) ?? r.from;
    r.to = charMap.get(r.to) ?? r.to;
    r.type = typeMap.get(r.type) ?? r.type;
  }
  const sheetIds = new Set(p.sheets.map((s) => s.defNo));
  snap.id = takeId(p);
  if (!snap.defNo || sheetIds.has(snap.defNo)) snap.defNo = nextSheetDefNo(p);
  const fixed = normalizeSheet(snap, snap.id) ?? snap;
  /* normalizeSheet 不會改 id；保險起見把座標壞掉的角色放到中央 */
  for (const c of fixed.chars) {
    if (!Number.isFinite(c.x)) c.x = fixed.W / 2;
    if (!Number.isFinite(c.y)) c.y = fixed.H / 2;
  }
  p.sheets.push(fixed);
  return p.sheets.length - 1;
}

/** 加入範例（新分頁，不動現有內容） */
export function addSample(sheet: Sheet): void {
  updateProject((p) => {
    p.active = insertSheet(p, sheet);
  });
  const u = useUi.getState();
  setUi({ sel: [], focus: null, hover: null, link: null, panel: null, fitTick: u.fitTick + 1 });
}

/** 清空目前分頁的角色與關係 */
export function clearSheet(): void {
  editSheet((s) => {
    s.chars = [];
    s.rels = [];
  });
  setUi({ sel: [], focus: null, hover: null, panel: null });
}

/* ---------- 分頁設定 ---------- */

export function updateSettings(recipe: (s: Draft<SheetSettings>) => void): void {
  editSheet((s) => recipe(s.settings));
}

/** 間距改了：依目前的陣型重排（原作的做法） */
export function setSpacing(pct: number): void {
  editSheet((s) => {
    s.settings.spacingPct = Math.round(Math.min(1000, Math.max(10, pct)));
    applyLayout(ctxOf(s), s.settings.lastLayout);
  });
}

/* ---------- 角色 ---------- */

/** 新增一位角色（畫布中央附近不重疊的位置），回傳 id */
export function addChar(rand: () => number = Math.random): number {
  let id = 0;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const ctx = ctxOf(s);
    const pos = nonOverlapping(
      ctx,
      ctx.W / 2 + (rand() - 0.5) * 60,
      ctx.H / 2 + (rand() - 0.5) * 60,
      null,
    );
    id = takeId(p);
    s.chars.push(makeChar(id, '', pos.x, pos.y, { defNo: nextCharDefNo(p) }));
  });
  setUi({ panel: { kind: 'char', id }, sel: [] });
  return id;
}

/** 一次建立好幾位（名字或頭像）；空分頁時整批排成目前的陣型。回傳建立的 id */
export function addChars(
  items: { name: string; avatar?: Avatar | null }[],
  rand: () => number = Math.random,
): number[] {
  const ids: number[] = [];
  if (!items.length) return ids;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const wasEmpty = s.chars.length === 0;
    for (const it of items) {
      const ctx = ctxOf(s);
      const pos = nonOverlapping(
        ctx,
        ctx.W / 2 + (rand() - 0.5) * 60,
        ctx.H / 2 + (rand() - 0.5) * 60,
        null,
      );
      const id = takeId(p);
      ids.push(id);
      s.chars.push(
        makeChar(id, it.name, pos.x, pos.y, { defNo: nextCharDefNo(p), avatar: it.avatar ?? null }),
      );
    }
    if (wasEmpty) applyLayout(ctxOf(s), s.settings.lastLayout, rand);
  });
  return ids;
}

export function updateChar(id: number, recipe: (c: Draft<Char>) => void): void {
  editSheet((s) => {
    const c = s.chars.find((x) => x.id === id);
    if (c) recipe(c);
  });
}

/** 改了尺寸、重要度、顯示頭像之後解開重疊 */
export function updateCharSeparate(id: number, recipe: (c: Draft<Char>) => void): void {
  editSheet((s) => {
    const c = s.chars.find((x) => x.id === id);
    if (!c) return;
    recipe(c);
    separateAll(ctxOf(s));
  });
}

export function updateChars(
  ids: readonly number[],
  recipe: (c: Draft<Char>) => void,
  separate = false,
): void {
  const set = new Set(ids);
  editSheet((s) => {
    for (const c of s.chars) if (set.has(c.id)) recipe(c);
    if (separate) separateAll(ctxOf(s));
  });
}

/** 複製角色（外觀與標籤；關係不複製），回傳新的 id */
export function copyChars(ids: readonly number[], rand: () => number = Math.random): number[] {
  const out: number[] = [];
  const set = new Set(ids);
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const src = s.chars.filter((c) => set.has(c.id));
    for (const c of src) {
      const cp = JSON.parse(JSON.stringify(c)) as Char;
      cp.id = takeId(p);
      cp.name = copyName(c.name, s.chars);
      cp.defNo = nextCharDefNo(p);
      if (src.length === 1) {
        const pos = nonOverlapping(ctxOf(s), c.x + 60, c.y + 60, null);
        cp.x = pos.x;
        cp.y = pos.y;
      } else {
        cp.x = c.x + 60;
        cp.y = c.y + 60;
      }
      void rand;
      s.chars.push(cp);
      out.push(cp.id);
    }
  });
  return out;
}

/** 刪除角色與他們的關係 */
export function deleteChars(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  editSheet((s) => {
    s.chars = s.chars.filter((c) => !set.has(c.id));
    s.rels = s.rels.filter((r) => !set.has(r.from) && !set.has(r.to));
  });
  pruneUi();
}

/** 角色清單換順序（未釘選的角色接手位置） */
export function reorderChar(from: number, to: number): void {
  editSheet((s) => {
    reorderKeepSlots(s.chars as Char[], from, to);
    separateAll(ctxOf(s));
  });
}

/* ---------- 標籤（整個專案共用的文字） ---------- */

/** 把標籤加到角色身上（同名沿用既有的標籤）；回傳標籤 id */
export function addLabel(charIds: readonly number[], text: string): number | null {
  const t = text.trim().slice(0, 100);
  if (!t) return null;
  let lid = 0;
  const set = new Set(charIds);
  updateProject((p) => {
    let l = p.labels.find((x) => x.text === t);
    if (!l) {
      l = { id: takeId(p), text: t };
      p.labels.push(l);
    }
    lid = l.id;
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    for (const c of s.chars) if (set.has(c.id) && !c.labels.includes(lid)) c.labels.push(lid);
  });
  return lid;
}

export function toggleLabel(charIds: readonly number[], labelId: number, on: boolean): void {
  updateChars(charIds, (c) => {
    if (on && !c.labels.includes(labelId)) c.labels.push(labelId);
    if (!on) c.labels = c.labels.filter((l) => l !== labelId);
  });
}

/* ---------- 關係類型 ---------- */

export function addType(): number {
  let id = 0;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    id = takeId(p);
    s.types.push(makeType(id, unnamedTypeLabel(s.types as RelType[])));
  });
  setUi({ panel: { kind: 'type', id } });
  return id;
}

export function updateType(id: number, recipe: (t: Draft<RelType>) => void): void {
  editSheet((s) => {
    const t = s.types.find((x) => x.id === id);
    if (t) recipe(t);
  });
}

/** 名稱欄離開時：清空的名稱存成「未命名關係 N」（N＝其他關係類型的最大編號＋1；原作存檔時的做法） */
export function fillTypeLabel(id: number): void {
  const t = activeSheet().types.find((x) => x.id === id);
  if (!t || t.label.trim()) return;
  editSheet((s) => {
    const d = s.types.find((x) => x.id === id);
    if (d) d.label = unnamedTypeLabel(s.types.filter((x) => x.id !== id) as RelType[]);
  });
}

export function copyType(id: number): number {
  let nid = 0;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const src = s.types.find((t) => t.id === id);
    if (!src) return;
    nid = takeId(p);
    s.types.push({
      ...JSON.parse(JSON.stringify(src)),
      id: nid,
      label: copyTypeLabel(src.label, s.types as RelType[]),
    });
  });
  return nid;
}

export function deleteType(id: number): void {
  editSheet((s) => {
    s.types = s.types.filter((t) => t.id !== id);
    s.rels = s.rels.filter((r) => r.type !== id);
  });
  const u = useUi.getState();
  if (u.link?.typeId === id) setUi({ link: null });
  pruneUi();
}

/** 顯示／隱藏；solo＝只顯示這一種（已經是唯一顯示時＝全部顯示） */
export function toggleTypeHidden(id: number, solo: boolean): void {
  editSheet((s) => {
    const t = s.types.find((x) => x.id === id);
    if (!t) return;
    if (solo) {
      const isSolo = !t.hidden && s.types.every((x) => x.id === id || x.hidden);
      for (const x of s.types) x.hidden = isSolo ? false : x.id !== id;
    } else t.hidden = !t.hidden;
  });
}

export function moveType(from: number, to: number): void {
  editSheet((s) => {
    if (from === to || !s.types[from] || to < 0 || to >= s.types.length) return;
    const [t] = s.types.splice(from, 1);
    s.types.splice(to, 0, t);
  });
}

/* ---------- 建立關係模式 ---------- */

/** 同兩人同類已經有了（含雙向） */
export function relDup(
  rels: readonly Rel[],
  exclude: number | null,
  from: number,
  to: number,
  type: number,
  both: boolean,
): boolean {
  return rels.some(
    (k) =>
      k.id !== exclude &&
      k.type === type &&
      ((k.from === from && k.to === to) ||
        (k.both && k.from === to && k.to === from) ||
        (both && k.from === to && k.to === from)),
  );
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;
function linkFlash(text: string, ok: boolean): void {
  const l = useUi.getState().link;
  if (!l) return;
  setUi({ link: { ...l, flash: { text, ok } } });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    const cur = useUi.getState().link;
    if (cur) setUi({ link: { ...cur, flash: null } });
  }, 1600);
}

export function startLink(typeId: number): void {
  const u = useUi.getState();
  if (u.link?.typeId === typeId) {
    setUi({ link: null });
    return;
  }
  setUi({ link: { typeId, from: null, made: [], flash: null }, sel: [], focus: null });
}

export const endLink = (): void => setUi({ link: null });

/** 建立關係模式中點了一位角色 */
export function linkClick(charId: number): void {
  const l = useUi.getState().link;
  if (!l) return;
  const s = activeSheet();
  if (!s.types.some((t) => t.id === l.typeId)) {
    endLink();
    return;
  }
  if (!s.chars.some((c) => c.id === charId)) return;
  if (l.from === null) {
    setUi({ link: { ...l, from: charId } });
    return;
  }
  if (l.from === charId) {
    setUi({ link: { ...l, from: null } });
    return;
  }
  const from = l.from;
  const to = charId;
  const dup = s.rels.find(
    (r) =>
      r.type === l.typeId &&
      ((r.from === from && r.to === to) || (r.both && r.from === to && r.to === from)),
  );
  if (dup) {
    if (l.made.includes(dup.id)) {
      editSheet((d) => {
        d.rels = d.rels.filter((r) => r.id !== dup.id);
      });
      setUi({ link: { ...l, made: l.made.filter((x) => x !== dup.id) } });
      return;
    }
    linkFlash('這條關係已經存在了', false);
    return;
  }
  const rev = s.rels.find((x) => x.type === l.typeId && !x.both && x.from === to && x.to === from);
  if (rev) {
    editSheet((d) => {
      const r = d.rels.find((x) => x.id === rev.id);
      if (r) r.both = true;
    });
    const a = s.chars.find((c) => c.id === from);
    const b = s.chars.find((c) => c.id === to);
    linkFlash(
      `${a ? displayName(a) : ''} 與 ${b ? displayName(b) : ''} 原本已有反向的同類關係，已合併成一條雙向線`,
      true,
    );
    return;
  }
  let nid = 0;
  updateProject((p) => {
    const d = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    nid = takeId(p);
    d.rels.push(makeRel(nid, from, to, l.typeId));
  });
  const cur = useUi.getState().link;
  if (cur) setUi({ link: { ...cur, made: [...cur.made, nid] } });
}

/** 長按角色＝指向自己 */
export function linkSelf(charId: number): void {
  const l = useUi.getState().link;
  if (!l) return;
  const s = activeSheet();
  const dup = s.rels.find((r) => r.type === l.typeId && r.from === charId && r.to === charId);
  if (dup) {
    if (l.made.includes(dup.id)) {
      editSheet((d) => {
        d.rels = d.rels.filter((r) => r.id !== dup.id);
      });
      setUi({ link: { ...l, made: l.made.filter((x) => x !== dup.id) } });
      return;
    }
    linkFlash('這條關係已經存在了', false);
    return;
  }
  let nid = 0;
  updateProject((p) => {
    const d = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    nid = takeId(p);
    d.rels.push(makeRel(nid, charId, charId, l.typeId));
  });
  const cur = useUi.getState().link;
  if (cur) setUi({ link: { ...cur, made: [...cur.made, nid] } });
}

/* ---------- 關係線 ---------- */

export function updateRel(id: number, recipe: (r: Draft<Rel>) => void): void {
  editSheet((s) => {
    const r = s.rels.find((x) => x.id === id);
    if (r) recipe(r);
  });
}

/** 換關係類型（同兩人已有同類時擋下，回傳 false） */
export function changeRelType(id: number, type: number): boolean {
  const s = activeSheet();
  const r = s.rels.find((x) => x.id === id);
  if (!r || r.type === type) return true;
  if (relDup(s.rels, r.id, r.from, r.to, type, r.both)) return false;
  updateRel(id, (d) => {
    d.type = type;
  });
  return true;
}

/** 反向的同類單向線 */
export function reverseOf(s: Sheet, r: Rel): Rel | undefined {
  return r.both
    ? undefined
    : s.rels.find(
        (k) => k.id !== r.id && !k.both && k.from === r.to && k.to === r.from && k.type === r.type,
      );
}

export function mergeRel(id: number): void {
  editSheet((s) => {
    const r = s.rels.find((x) => x.id === id);
    if (!r) return;
    const rev = reverseOf(s as Sheet, r as Rel);
    if (!rev) return;
    r.both = true;
    s.rels = s.rels.filter((k) => k.id !== rev.id);
  });
}

export function splitRel(id: number): void {
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const r = s.rels.find((x) => x.id === id);
    if (!r?.both) return;
    r.both = false;
    s.rels.push(makeRel(takeId(p), r.to, r.from, r.type));
  });
}

/** 反轉方向（會撞到既有的回傳 false） */
export function flipRel(id: number): boolean {
  const s = activeSheet();
  const r = s.rels.find((x) => x.id === id);
  if (!r || r.both) return false;
  if (relDup(s.rels, r.id, r.to, r.from, r.type, r.both)) return false;
  updateRel(id, (d) => {
    const t = d.from;
    d.from = d.to;
    d.to = t;
    if (d.curveDir) d.curveDir = d.curveDir === 1 ? -1 : 1;
  });
  return true;
}

/** 這兩人之間的線、可見的線、捆綁的狀態 */
export function pairInfo(s: Sheet, r: Rel) {
  const ctx = sheetCtx(s);
  const pairList = s.rels.filter(
    (x) => (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from),
  );
  const skip = (x: Rel) => !!(x.pairSkip || ctx.typeById.get(x.type)?.pairSkip);
  const bundle = pairList.filter((x) => !skip(x));
  const canBundle =
    (pairList.length >= 2 &&
      pairList.some((x) => x.both || x.to === r.from) &&
      pairList.some((x) => x.both || x.to === r.to)) ||
    (pairList.length === 1 && r.both);
  const trunkOn =
    bundle.length >= 2
      ? bundle.some((x) => x.both || x.to === r.from) && bundle.some((x) => x.both || x.to === r.to)
      : bundle.length === 1 && bundle[0].both;
  const curveGroup = trunkOn ? (skip(r) ? [r] : bundle) : pairList;
  const rep = curveGroup[curveGroup.length - 1];
  const curve = rep?.curveDir ? rep.curveDir : (curveGroup.find((x) => x.curveDir)?.curveDir ?? 0);
  return {
    pairList,
    canBundle,
    trunkOn,
    curveGroup,
    curve,
    typeSkip: !!ctx.typeById.get(r.type)?.pairSkip,
  };
}

export function setCurve(id: number, dir: 0 | 1 | -1): void {
  const s = activeSheet();
  const r = s.rels.find((x) => x.id === id);
  if (!r) return;
  const ids = new Set(pairInfo(s, r).curveGroup.map((x) => x.id));
  editSheet((d) => {
    for (const x of d.rels) if (ids.has(x.id)) x.curveDir = dir;
  });
}

/** 捆綁／解除捆綁（這兩人之間全部的線） */
export function toggleBundle(id: number): void {
  const s = activeSheet();
  const r = s.rels.find((x) => x.id === id);
  if (!r) return;
  const info = pairInfo(s, r);
  const ids = new Set(info.pairList.map((x) => x.id));
  editSheet((d) => {
    for (const x of d.rels) if (ids.has(x.id)) x.pairSkip = info.trunkOn;
  });
}

export function deleteRel(id: number): void {
  editSheet((s) => {
    s.rels = s.rels.filter((r) => r.id !== id);
  });
  pruneUi();
}

/* ---------- 排列、對齊、畫布 ---------- */

export function layoutSheet(kind: LayoutKind, rand: () => number = Math.random): void {
  editSheet((s) => {
    applyLayout(ctxOf(s), kind, rand);
  });
}

export function shuffle(rand: () => number = Math.random): void {
  const sel = new Set(useUi.getState().sel);
  editSheet((s) => {
    const pool = sel.size ? s.chars.filter((c) => sel.has(c.id)) : s.chars;
    shuffleSeats(pool as Char[], rand);
  });
}

/** 對齊與分佈：選 2 位以上＝以選取範圍為參考；只選 1 位＝只移動那一位、以畫布為參考；沒有選取＝全部、以畫布為參考（原作） */
export function align(action: AlignAction): void {
  const sel = new Set(useUi.getState().sel);
  editSheet((s) => {
    const picked = s.chars.filter((c) => sel.has(c.id));
    const targets = picked.length ? picked : s.chars;
    applyAlign(ctxOf(s), targets as Char[], action, picked.length < 2);
  });
}

export function fitCanvas(): boolean {
  if (!activeSheet().chars.length) return false;
  editSheet((s) => {
    fitCanvasToContent(ctxOf(s));
  });
  return true;
}

/* ---------- 貼上關係表 ---------- */

export function importTable(parsed: ParsedTable, rand: () => number = Math.random): number {
  let made = 0;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const plan = planImport(parsed, s.chars as Char[], s.types as RelType[]);
    const wasEmpty = s.chars.length === 0;
    const byName = new Map<string, number>();
    for (const c of s.chars) {
      const k = c.name.trim();
      if (k && !byName.has(k)) byName.set(k, c.id);
    }
    for (const nm of plan.newNames) {
      const ctx = ctxOf(s);
      const pos = nonOverlapping(
        ctx,
        ctx.W / 2 + (rand() - 0.5) * 60,
        ctx.H / 2 + (rand() - 0.5) * 60,
        null,
      );
      const id = takeId(p);
      s.chars.push(makeChar(id, nm, pos.x, pos.y, { defNo: nextCharDefNo(p) }));
      byName.set(nm, id);
    }
    const typeByLabel = new Map<string, number>();
    for (const t of s.types) {
      const k = t.label.trim();
      if (k && !typeByLabel.has(k)) typeByLabel.set(k, t.id);
    }
    const mkType = (label: string) => {
      const id = takeId(p);
      s.types.push(makeType(id, label));
      typeByLabel.set(label, id);
      return id;
    };
    for (const l of plan.relLabels) mkType(l);
    for (const r of plan.links) {
      const a = byName.get(r.from.trim());
      const b = byName.get(r.to.trim());
      if (a === undefined || b === undefined) continue;
      const lbl = r.rel.trim();
      const type = lbl
        ? typeByLabel.get(lbl)
        : (s.types[0]?.id ?? mkType(unnamedTypeLabel(s.types as RelType[])));
      if (type === undefined) continue;
      if (relDup(s.rels as Rel[], null, a, b, type, false)) continue;
      s.rels.push(makeRel(takeId(p), a, b, type, { note: r.note }));
      made++;
    }
    if (wasEmpty) applyLayout(ctxOf(s), s.settings.lastLayout, rand);
  });
  return made;
}

/* ---------- 拖曳時的碰撞（給畫布用） ---------- */

export { charRadius };
