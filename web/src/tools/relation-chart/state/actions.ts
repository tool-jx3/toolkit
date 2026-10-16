/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 專案的修改（原作的新增角色、批次建立、複製、刪除、關係類型、建立關係模式、關係線的編輯、分頁、排列、
 * 標籤庫、收合、群體關係…）。每個動作是一步復原（拖曳、滑桿、文字欄由呼叫端用手勢包成一步）。
 */
import type { Draft } from 'immer';
import { charRadius, displayName, sheetCtx, sheetName } from '../engine/geom';
import { grelEndId, grelEndIsLbl, labelInfo } from '../engine/labels';
import { type AlignAction, applyAlign } from '../logic/align';
import {
  applyLayout,
  fitCanvasToContent,
  nonOverlapping,
  reorderKeepSlots,
  resizeCanvas,
  separateAll,
  shuffleSeats,
} from '../logic/layout';
import { type ParsedTable, planImport } from '../logic/table';
import { charLabelIds, dropCharLabels, setCharLabel, setCharLabelIds } from '../model/charLabels';
import {
  copyName,
  copyTypeLabel,
  makeChar,
  makeLabel,
  makeRel,
  makeType,
  unnamedLabelText,
  unnamedTypeLabel,
} from '../model/factory';
import { entryById, forkEntry, reclaimVirgin, variantFrom, variantOf } from '../model/library';
import {
  emptySheet,
  GREL_END_RE,
  newSettings,
  normalizeSheet,
  remapGrelEnd,
  remapViews,
  smallestFree,
} from '../model/normalize';
import { allChars, shiftOtherFrames } from '../model/timeline';
import type {
  Avatar,
  Char,
  ColorValue,
  GroupRel,
  Label,
  LayoutKind,
  Note,
  Project,
  Rel,
  RelType,
  Sheet,
  SheetSettings,
  Timeline,
} from '../model/types';
import {
  activeIndex,
  activeSheet,
  projectNow,
  setUi,
  type UiState,
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

/**
 * 換了分頁（切換、新增、刪除、加入範例）之後的右側面板：世界觀、備忘錄、統計是跟著分頁的面板，留著並換成新分頁的內容
 * （原作的浮動面板也是；7.10）；指著某位角色、某條關係、某張便利貼的面板關掉。統計鎖定的聚焦指著上一張分頁的角色＝解除。
 */
function sheetChangedUi(): Pick<UiState, 'panel' | 'statsFocus'> {
  const p = useUi.getState().panel;
  const keep = p?.kind === 'lore' || p?.kind === 'memo' || p?.kind === 'stats';
  return { panel: keep ? p : null, statsFocus: null };
}

/** 全專案未用的角色預設編號 */
const nextCharDefNo = (p: Project | DProject): number =>
  smallestFree(p.sheets.flatMap((s) => allChars(s as Sheet).map((c) => c.defNo)));
const nextSheetDefNo = (p: Project | DProject): number =>
  smallestFree(p.sheets.map((s) => s.defNo));

/** 分頁的 ctx（帶專案的標籤：收合中的成員不排列、不推擠） */
const ctxOf = (s: DSheet) => sheetCtx(s as Sheet, projectNow().labels);

/** 只在畫面上有的東西（選取、聚焦、面板）跟著刪掉的內容一起清 */
function pruneUi(): void {
  const s = activeSheet();
  const ids = new Set(s.chars.map((c) => c.id));
  const relIds = new Set(s.rels.map((r) => r.id));
  const typeIds = new Set(s.types.map((t) => t.id));
  const lblIds = new Set(projectNow().labels.map((l) => l.id));
  const grelIds = new Set(s.grels.map((g) => g.id));
  const noteIds = new Set(s.notes.map((n) => n.id));
  const u = useUi.getState();
  /* 收合中的成員不能留在選取裡（批次操作會打到看不見的人） */
  const hidden = labelInfo(sheetCtx(s, projectNow().labels)).colHidden;
  const sel = u.sel.filter((id) => ids.has(id) && !hidden.has(id));
  const alive = (f: { kind: string; id?: number; key?: string } | null) =>
    !f ||
    (f.kind === 'node' && ids.has(f.id as number)) ||
    (f.kind === 'edge' && relIds.has(f.id as number)) ||
    (f.kind === 'type' && typeIds.has(f.id as number)) ||
    (f.kind === 'char' && ids.has(f.id as number)) ||
    (f.kind === 'rel' && relIds.has(f.id as number)) ||
    (f.kind === 'label' && lblIds.has(f.id as number)) ||
    (f.kind === 'grel' && grelIds.has(f.id as number)) ||
    /* 角色資訊（7.8：之前漏了，任何一步復原紀錄都會把它關掉，例如資訊編輯區失焦） */
    (f.kind === 'info' && ids.has(f.id as number)) ||
    (f.kind === 'note' && noteIds.has(f.id as number)) ||
    f.kind === 'coledge' ||
    f.kind === 'lore' ||
    f.kind === 'memo' ||
    f.kind === 'stats';
  const endAlive = (t: string | null) =>
    t !== null && (grelEndIsLbl(t) ? lblIds.has(grelEndId(t)) : ids.has(grelEndId(t)));
  const link =
    u.link && typeIds.has(u.link.typeId)
      ? { ...u.link, from: endAlive(u.link.from) ? u.link.from : null }
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
    ...sheetChangedUi(),
    renaming: null,
    fitTick: u.fitTick + 1,
    /* 交換位置模式留著、挑起的清掉（原作） */
    swap: u.swap ? { pick: null } : null,
  });
}

/**
 * 新增分頁。copy：'same'＝複製目前的分頁、同一批人（共用條目與變體：改名字兩邊一起變；原作的複製分頁，D5）；
 * 'fork'＝複製成獨立的新角色（每位角色複製成角色庫的新條目，只帶目前這件變體）。
 * 角色、關係類型、關係線、群體關係、便利貼的 id 換新的；看法跟著複製（原作漏了）。
 */
export function addSheet(copy: boolean | 'same' | 'fork'): void {
  const mode = copy === true ? 'same' : copy;
  updateProject((p) => {
    const cur = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const id = takeId(p);
    const defNo = nextSheetDefNo(p);
    let sheet: Sheet;
    if (mode) {
      const snap = JSON.parse(JSON.stringify(cur)) as Sheet;
      const charMap = new Map<number, number>();
      const typeMap = new Map<number, number>();
      const relMap = new Map<number, number>();
      const noteMap = new Map<number, number>();
      const used = new Set(p.sheets.flatMap((s) => allChars(s as Sheet).map((c) => c.defNo)));
      /* 複製成獨立的新角色：同一位角色（時間軸的每一格）共用一筆新條目；各格穿的不同變體各自複製進新條目 */
      const forks = new Map<number, { lib: number; vari: Map<number, number>; defNo: number }>();
      const fork = (c: Char) => {
        let f = forks.get(c.id);
        if (!f) {
          const r = forkEntry(p as Project, c);
          f = { lib: r.lib, vari: new Map(r.lib ? [[c.vari, r.vari]] : []), defNo: 0 };
          if (!c.name) {
            f.defNo = smallestFree(used);
            used.add(f.defNo);
          }
          forks.set(c.id, f);
        } else if (f.lib && !f.vari.has(c.vari)) {
          const v = variantOf(p as Project, c).variant;
          const e = entryById(p as Project, f.lib);
          if (v && e) {
            const nv = variantFrom(v, takeId(p), v.radars);
            e.variants.push(nv);
            f.vari.set(c.vari, nv.id);
          }
        }
        const nv = f.vari.get(c.vari);
        if (f.lib && nv) {
          c.lib = f.lib;
          c.vari = nv;
        }
        if (f.defNo) c.defNo = f.defNo;
      };
      for (const c of snap.chars) {
        const nid = takeId(p);
        charMap.set(c.id, nid);
        c.id = nid;
        if (mode === 'fork') fork(c);
      }
      /* 時間軸分頁：每一格一起複製（原作只複製目前影格、還變成一般分頁）；同一位角色、同一條線在各格用同一個新 id */
      remapFrameChars(p, snap.tl, charMap, mode === 'fork' ? fork : null);
      for (const t of snap.types) {
        const nid = takeId(p);
        typeMap.set(t.id, nid);
        t.id = nid;
      }
      for (const r of snap.rels) {
        const nid = takeId(p);
        relMap.set(r.id, nid);
        r.id = nid;
        r.from = charMap.get(r.from) ?? r.from;
        r.to = charMap.get(r.to) ?? r.to;
        r.type = typeMap.get(r.type) ?? r.type;
      }
      remapGrels(p, snap.grels, charMap, typeMap, null);
      snap.views = remapViews(snap.views ?? {}, charMap);
      /* 便利貼與圖表節點一起複製（新 id；圖表節點的 A、B 換成新角色）；世界觀、沿用、備忘錄照抄（原作） */
      remapNotes(p, snap.notes ?? [], charMap, null, noteMap);
      remapFrameRest(p, snap.tl, { charMap, typeMap, relMap, noteMap, tplMap: null });
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
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    ...sheetChangedUi(),
    fitTick: u.fitTick + 1,
  });
}

export function renameSheet(idx: number, name: string): void {
  updateProject((p) => {
    const s = p.sheets[idx];
    if (s) s.name = name.trim().slice(0, 200);
  });
}

/** 刪除分頁（只剩一張時不能刪）：同時封存進分頁庫（新的在前；名稱＝刪除當下的顯示名，原作；7.4 第 14 項） */
export function deleteSheet(idx: number): boolean {
  const p = projectNow();
  if (p.sheets.length <= 1 || !p.sheets[idx]) return false;
  updateProject((d) => {
    const gone = d.sheets[idx] as Sheet;
    d.sheetLib.unshift({
      id: takeId(d),
      name: sheetName(gone),
      savedAt: Date.now(),
      sheet: JSON.parse(JSON.stringify(gone)) as Sheet,
    });
    d.sheets.splice(idx, 1);
    if (d.active >= d.sheets.length) d.active = d.sheets.length - 1;
    else if (d.active > idx) d.active--;
  });
  const u = useUi.getState();
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    ...sheetChangedUi(),
    fitTick: u.fitTick + 1,
  });
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

/** 加進專案時的 id 對照（標籤、角色庫的條目與變體、關係庫的條目與變體、數值範本；分頁＝填入舊 id → 新 id） */
export interface SheetMaps {
  labelMap?: Map<number, number>;
  entryMap?: Map<number, number>;
  varMap?: Map<number, number>;
  relEntryMap?: Map<number, number>;
  relVarMap?: Map<number, number>;
  tplMap?: Map<number, number>;
  sheetMap?: Map<number, number>;
}

/** 便利貼換成新的 id；圖表節點的 A、B 照 charMap、範本照 tplMap（沒給＝不換） */
export function remapNotes(
  p: DProject,
  notes: Note[],
  charMap: ReadonlyMap<number, number>,
  tplMap: ReadonlyMap<number, number> | null,
  noteMap?: Map<number, number>,
): void {
  for (const n of notes) {
    const old = n.id;
    const known = noteMap?.get(old);
    n.id = known ?? takeId(p);
    if (noteMap && known === undefined) noteMap.set(old, n.id);
    if (!n.chart) continue;
    /* 不在這張分頁的角色（已刪掉）＝沒有 */
    n.chart.a = charMap.get(n.chart.a) ?? 0;
    n.chart.b = charMap.get(n.chart.b) ?? 0;
    if (tplMap) n.chart.tpl = tplMap.get(n.chart.tpl) ?? n.chart.tpl;
  }
}

/**
 * 把一張用區域 id 寫的分頁加進專案（範例、原作的專案檔），id 換成專案的；回傳新分頁的索引。
 * mapChar：舊角色 id → 新 id。角色的條目與變體、關係類型的綁定、看法照對照表換（沒有對照的＝沒有綁定，同步時建新的）。
 */
export function insertSheet(
  p: DProject,
  src: Sheet,
  opts: { keepName?: boolean; mapChar?: Map<number, number> } & SheetMaps = {},
): number {
  const snap = JSON.parse(JSON.stringify(src)) as Sheet;
  const charMap = opts.mapChar ?? new Map<number, number>();
  const typeMap = new Map<number, number>();
  const relMap = new Map<number, number>();
  const noteMap = new Map<number, number>();
  const used = new Set(p.sheets.flatMap((s) => allChars(s as Sheet).map((c) => c.defNo)));
  /* 同一位角色在時間軸的每一格用同一個預設編號 */
  const defNos = new Map<number, number>();
  const fixChar = (c: Char) => {
    const d = defNos.get(c.id);
    if (d !== undefined) c.defNo = d;
    else {
      if (!c.defNo || used.has(c.defNo)) c.defNo = smallestFree(used);
      used.add(c.defNo);
      defNos.set(c.id, c.defNo);
    }
    if (opts.labelMap)
      setCharLabelIds(
        c,
        charLabelIds(c)
          .map((l) => opts.labelMap?.get(l) ?? -1)
          .filter((l) => l > 0),
      );
    if (opts.entryMap) {
      c.lib = opts.entryMap.get(c.lib) ?? 0;
      c.vari = opts.varMap?.get(c.vari) ?? 0;
    }
  };
  for (const c of snap.chars) {
    const nid = takeId(p);
    charMap.set(c.id, nid);
    c.id = nid;
    fixChar(c);
  }
  remapFrameChars(p, snap.tl, charMap, fixChar);
  for (const t of snap.types) {
    const nid = takeId(p);
    typeMap.set(t.id, nid);
    t.id = nid;
    if (opts.relEntryMap) {
      t.lib = opts.relEntryMap.get(t.lib) ?? 0;
      t.vari = opts.relVarMap?.get(t.vari) ?? 0;
    }
  }
  snap.views = remapViews(snap.views ?? {}, charMap);
  for (const r of snap.rels) {
    const nid = takeId(p);
    relMap.set(r.id, nid);
    r.id = nid;
    r.from = charMap.get(r.from) ?? r.from;
    r.to = charMap.get(r.to) ?? r.to;
    r.type = typeMap.get(r.type) ?? r.type;
  }
  /* 群體關係、收合名單、標籤節點位置、陣營名稱角度：標籤 id 換成專案的 */
  const lm = opts.labelMap;
  remapGrels(p, snap.grels ?? [], charMap, typeMap, lm ?? null);
  if (lm) {
    snap.collapsed = (snap.collapsed ?? []).map((l) => lm.get(l) ?? -1).filter((l) => l > 0);
    const st = snap.settings as Partial<SheetSettings> | undefined;
    if (st) {
      const rekey = <T>(o: Record<string, T> | undefined) => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(o ?? {})) {
          const n = lm.get(Number(k));
          if (n !== undefined) out[n] = v;
        }
        return out;
      };
      st.labelPos = rekey(st.labelPos);
      st.zoneNameAng = rekey(st.zoneNameAng);
    }
  }
  const sheetIds = new Set(p.sheets.map((s) => s.defNo));
  const oldId = snap.id;
  snap.id = takeId(p);
  opts.sheetMap?.set(oldId, snap.id);
  /* 便利貼最後才配 id（沒有便利貼時其他東西的 id 和以前相同）；時間軸的其他影格在最後 */
  remapNotes(p, snap.notes ?? [], charMap, opts.tplMap ?? null, noteMap);
  remapFrameRest(p, snap.tl, { charMap, typeMap, relMap, noteMap, tplMap: opts.tplMap ?? null });
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

/** 時間軸其他影格的角色換成新的 id（和頂層同一位的照 charMap，只在別格出現的配新的）；fix＝每份角色的其他整理 */
function remapFrameChars(
  p: DProject,
  tl: Timeline | null | undefined,
  charMap: Map<number, number>,
  fix: ((c: Char) => void) | null,
): void {
  if (!tl) return;
  tl.frames.forEach((f, k) => {
    if (k === tl.active) return;
    for (const c of f.chars) {
      let nid = charMap.get(c.id);
      if (nid === undefined) {
        nid = takeId(p);
        charMap.set(c.id, nid);
      }
      c.id = nid;
      fix?.(c);
    }
  });
}

/** 時間軸其他影格的影格 id、關係線、便利貼換成新的 id（同一條線、同一張便利貼在各格用同一個新 id） */
function remapFrameRest(
  p: DProject,
  tl: Timeline | null | undefined,
  m: {
    charMap: ReadonlyMap<number, number>;
    typeMap: ReadonlyMap<number, number>;
    relMap: Map<number, number>;
    noteMap: Map<number, number>;
    tplMap: ReadonlyMap<number, number> | null;
  },
): void {
  if (!tl) return;
  tl.frames.forEach((f, k) => {
    f.id = takeId(p);
    if (k === tl.active) return;
    for (const r of f.rels) {
      let nid = m.relMap.get(r.id);
      if (nid === undefined) {
        nid = takeId(p);
        m.relMap.set(r.id, nid);
      }
      r.id = nid;
      r.from = m.charMap.get(r.from) ?? r.from;
      r.to = m.charMap.get(r.to) ?? r.to;
      r.type = m.typeMap.get(r.type) ?? r.type;
    }
    remapNotes(p, f.notes, m.charMap, m.tplMap, m.noteMap);
  });
}

/**
 * 把別處的一張分頁（分頁庫、快照）加成新分頁；src＝那張分頁所在的專案（角色庫、關係庫、標籤、數值範本）。
 * 條目、變體、標籤現在的專案裡有＝照用（同 id；原作也是用角色庫現在的樣子），沒有＝從 src 複製過來（新 id）；
 * 都沒有＝不綁（同步時依角色身上的外觀重建）。回傳新分頁的索引。
 */
export function importSheetFrom(
  p: DProject,
  sheet: Sheet,
  src: Pick<Project, 'library' | 'relLibrary' | 'labels' | 'radarTpls'>,
): number {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  /* 標籤：同 id 同名＝照用；同名＝沿用現有的；沒有＝複製過來 */
  const labelMap = new Map<number, number>();
  for (const l of src.labels) {
    const mine =
      p.labels.find((x) => x.id === l.id && x.text === l.text) ??
      p.labels.find((x) => x.text === l.text);
    if (mine) labelMap.set(l.id, mine.id);
    else {
      const id = takeId(p);
      p.labels.push({ ...clone(l), id });
      labelMap.set(l.id, id);
    }
  }
  const tplMap = new Map<number, number>();
  for (const t of src.radarTpls) if (p.radarTpls.some((x) => x.id === t.id)) tplMap.set(t.id, t.id);
  /* 角色庫：分頁（每一格）用到的條目與變體 */
  const entryMap = new Map<number, number>();
  const varMap = new Map<number, number>();
  for (const c of allChars(sheet)) {
    if (varMap.has(c.vari) && entryMap.has(c.lib)) continue;
    const mine = p.library.find((e) => e.id === c.lib);
    const theirs = src.library.find((e) => e.id === c.lib);
    const tv = theirs?.variants.find((v) => v.id === c.vari);
    if (mine?.variants.some((v) => v.id === c.vari)) {
      entryMap.set(c.lib, c.lib);
      varMap.set(c.vari, c.vari);
      continue;
    }
    if (!theirs || !tv) continue;
    const relabel = (v: (typeof theirs.variants)[number]) => {
      const nv = clone(v);
      nv.labels = nv.labels.map((l) => labelMap.get(l) ?? -1).filter((l) => l > 0);
      nv.radars = nv.radars.filter((r) => tplMap.has(r.tpl));
      return nv;
    };
    if (mine) {
      /* 條目還在、這件變體被刪掉了：把它加回條目 */
      const nv = { ...relabel(tv), id: takeId(p) };
      mine.variants.push(nv);
      entryMap.set(c.lib, mine.id);
      varMap.set(c.vari, nv.id);
    } else {
      const ne = clone(theirs);
      ne.id = takeId(p);
      ne.variants = theirs.variants.map((v) => {
        const nv = { ...relabel(v), id: takeId(p) };
        varMap.set(v.id, nv.id);
        return nv;
      });
      p.library.push(ne);
      entryMap.set(c.lib, ne.id);
    }
  }
  /* 關係庫 */
  const relEntryMap = new Map<number, number>();
  const relVarMap = new Map<number, number>();
  for (const t of sheet.types) {
    if (!t.lib) continue;
    const mine = p.relLibrary.find((e) => e.id === t.lib);
    if (mine?.variants.some((v) => v.id === t.vari)) {
      relEntryMap.set(t.lib, t.lib);
      relVarMap.set(t.vari, t.vari);
      continue;
    }
    const theirs = src.relLibrary.find((e) => e.id === t.lib);
    if (!theirs || relEntryMap.has(t.lib)) continue;
    const ne = clone(theirs);
    ne.id = takeId(p);
    for (const v of ne.variants) {
      const nid = takeId(p);
      relVarMap.set(v.id, nid);
      v.id = nid;
    }
    p.relLibrary.push(ne);
    relEntryMap.set(t.lib, ne.id);
  }
  const idx = insertSheet(p, sheet, {
    labelMap,
    entryMap,
    varMap,
    relEntryMap,
    relVarMap,
    tplMap,
  });
  /* 世界觀沿用的分頁不一定還在：指到不存在的＝自己的內容 */
  const s = p.sheets[idx];
  if (s.loreFrom !== null && !p.sheets.some((x) => x.id === s.loreFrom)) s.loreFrom = null;
  return idx;
}

/** 群體關係換成新的 id（角色端、例外照 charMap；標籤端照 labelMap，沒給＝不換） */
function remapGrels(
  p: DProject,
  grels: GroupRel[],
  charMap: ReadonlyMap<number, number>,
  typeMap: ReadonlyMap<number, number>,
  labelMap: ReadonlyMap<number, number> | null,
): void {
  const end = (e: string) => {
    if (grelEndIsLbl(e)) {
      const n = labelMap ? labelMap.get(grelEndId(e)) : grelEndId(e);
      return n === undefined ? e : `L${n}`;
    }
    return remapGrelEnd(e, charMap);
  };
  for (const g of grels) {
    g.id = takeId(p);
    g.from = end(g.from);
    g.to = end(g.to);
    g.type = typeMap.get(g.type) ?? g.type;
    g.except = g.except.map((x) => charMap.get(x) ?? x);
  }
}

/** 加入範例（新分頁，不動現有內容） */
export function addSample(sheet: Sheet): void {
  updateProject((p) => {
    p.active = insertSheet(p, sheet);
  });
  const u = useUi.getState();
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    ...sheetChangedUi(),
    fitTick: u.fitTick + 1,
  });
}

/** 清空目前分頁的角色與關係（角色庫的條目留著；這張分頁的看法、便利貼與圖表節點一起清，原作） */
export function clearSheet(): void {
  editSheet((s) => {
    s.chars = [];
    s.rels = [];
    s.grels = [];
    s.views = {};
    s.notes = [];
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

/**
 * 複製角色（新的人：角色庫的新條目，只帶目前這件變體〔外觀、標籤、數值、頭像框〕、角色資訊與角色字型；
 * 關係不複製；原作的 forkLibEntry），回傳新的 id
 */
export function copyChars(ids: readonly number[], rand: () => number = Math.random): number[] {
  const out: number[] = [];
  const set = new Set(ids);
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const src = s.chars.filter((c) => set.has(c.id));
    for (const c of src) {
      const cp = JSON.parse(JSON.stringify(c)) as Char;
      const f = forkEntry(p as Project, c);
      cp.lib = f.lib;
      cp.vari = f.vari;
      cp.id = takeId(p);
      cp.name = copyName(c.name, s.chars);
      /* 名字在變體上：新條目那一件也改成新名字（同步會從變體拉回來） */
      const nv = p.library.find((e) => e.id === f.lib)?.variants.find((v) => v.id === f.vari);
      if (nv) nv.name = cp.name;
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

/** 從一張分頁拿掉一些角色：他們的關係、是端點的群體關係、例外名單、看法 */
export function dropCharsFrom(s: DSheet, set0: ReadonlySet<number>, everywhere = false): void {
  s.chars = s.chars.filter((c) => !set0.has(c.id));
  s.rels = s.rels.filter((r) => !set0.has(r.from) && !set0.has(r.to));
  /* 時間軸分頁：everywhere＝每一格都刪（角色庫刪條目）；只刪目前影格時，別格還有這位角色＝群體關係、看法留著 */
  if (everywhere && s.tl)
    s.tl.frames.forEach((f, k) => {
      if (k === s.tl?.active) return;
      f.chars = f.chars.filter((c) => !set0.has(c.id));
      f.rels = f.rels.filter((r) => !set0.has(r.from) && !set0.has(r.to));
    });
  const left = s.tl ? new Set(allChars(s as Sheet).map((c) => c.id)) : null;
  const set = left ? new Set([...set0].filter((id) => !left.has(id))) : set0;
  if (!set.size) return;
  const gone = (e: string) => !grelEndIsLbl(e) && set.has(grelEndId(e));
  s.grels = s.grels.filter((g) => !gone(g.from) && !gone(g.to));
  for (const g of s.grels)
    if (g.except.some((x) => set.has(x))) g.except = g.except.filter((x) => !set.has(x));
  if (s.views && Object.keys(s.views).length) {
    for (const k of Object.keys(s.views)) {
      if (set.has(Number(k))) {
        delete s.views[k];
        continue;
      }
      const row = s.views[k];
      for (const t of Object.keys(row)) if (set.has(Number(t))) delete row[t];
      if (!Object.keys(row).length) delete s.views[k];
    }
  }
}

/** 刪除角色與他們的關係（條目留在角色庫；沒有內容的空角色連條目一起刪＝原作的空角色回收） */
export function deleteChars(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    const libs = s.chars.filter((c) => set.has(c.id)).map((c) => c.lib);
    dropCharsFrom(s, set);
    reclaimVirgin(p as Project, libs);
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
    const ex = p.labels.find((x) => x.text === t);
    if (ex) lid = ex.id;
    else {
      lid = takeId(p);
      p.labels.push(makeLabel(lid, t));
    }
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    for (const c of s.chars) if (set.has(c.id)) setCharLabel(c, lid, true);
  });
  return lid;
}

export function toggleLabel(charIds: readonly number[], labelId: number, on: boolean): void {
  updateChars(charIds, (c) => setCharLabel(c, labelId, on));
}

/* ---------- 標籤庫（第二批，F181） ---------- */

/** 新增標籤（同名沿用、顏色不動；沒給文字＝「未命名標籤 N」）；回傳 id */
export function createLabel(text?: string, color: ColorValue = 'auto'): number {
  const t = (text ?? '').trim().slice(0, 100);
  const ex = t ? projectNow().labels.find((l) => l.text === t) : undefined;
  if (ex) return ex.id;
  let id = 0;
  updateProject((p) => {
    id = takeId(p);
    p.labels.push(makeLabel(id, t || unnamedLabelText(p.labels as Label[]), { color }));
  });
  return id;
}

/** 改名（清空＝不改） */
export function renameLabel(id: number, text: string): void {
  const t = text.trim().slice(0, 100);
  if (!t) return;
  updateProject((p) => {
    const l = p.labels.find((x) => x.id === id);
    if (l && l.text !== t) l.text = t;
  });
}

/** 編輯模式的 Enter：文字（清空＝不改）與顏色一起覆蓋（一步復原） */
export function editLabel(id: number, text: string, color: ColorValue): void {
  const t = text.trim().slice(0, 100);
  const l = projectNow().labels.find((x) => x.id === id);
  if (!l || ((!t || t === l.text) && color === l.color)) return;
  updateProject((p) => {
    const d = p.labels.find((x) => x.id === id);
    if (!d) return;
    if (t) d.text = t;
    d.color = color;
  });
}

/** 顏色、三個開關（隱藏、沒有引力、陣營框）、頭像框（第三批）；不再是陣營框＝收合解除 */
export function updateLabel(
  id: number,
  patch: Partial<Pick<Label, 'color' | 'hidden' | 'noPull' | 'zone' | 'frame'>>,
): void {
  updateProject((p) => {
    const l = p.labels.find((x) => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    if (!l.zone)
      for (const s of p.sheets)
        if (s.collapsed.includes(id)) s.collapsed = s.collapsed.filter((x) => x !== id);
  });
}

/** 換順序（陣營框的內外圈、疊放、圖例、自動落點、收合的歸屬都照這個順序） */
export function moveLabel(from: number, to: number): void {
  updateProject((p) => {
    if (from === to || !p.labels[from] || to < 0 || to >= p.labels.length) return;
    const [l] = p.labels.splice(from, 1);
    p.labels.splice(to, 0, l);
  });
}

/**
 * 在看得到的一組標籤（搜尋結果、依分頁分組的一段）裡換順序：這組標籤在整份清單裡佔的那幾格不變，
 * 只換誰坐哪一格（其他標籤一格都不動）。
 */
export function reorderLabels(groupIds: readonly number[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= groupIds.length || to >= groupIds.length) return;
  const ids = [...groupIds];
  const [m] = ids.splice(from, 1);
  ids.splice(to, 0, m);
  updateProject((p) => {
    const byId = new Map(p.labels.map((l) => [l.id, l]));
    const slots = groupIds
      .map((id) => p.labels.findIndex((l) => l.id === id))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (slots.length !== ids.length) return;
    const next = [...p.labels];
    slots.forEach((slot, k) => {
      const l = byId.get(ids[k]);
      if (l) next[slot] = l;
    });
    p.labels = next;
  });
}

export const deleteLabel = (id: number): void => deleteLabels([id]);

/** 刪除標籤：所有角色身上、各分頁的標籤節點位置、陣營名稱角度、收合、用到它的群體關係一起清（不確認，可以復原） */
export function deleteLabels(ids: readonly number[]): void {
  const set = new Set(ids);
  if (!set.size) return;
  updateProject((p) => {
    p.labels = p.labels.filter((l) => !set.has(l.id));
    /* 角色庫裡沒有人穿的變體也一起拿掉（標籤在變體上） */
    for (const e of p.library)
      for (const v of e.variants)
        if (v.labels.some((l) => set.has(l))) v.labels = v.labels.filter((l) => !set.has(l));
    for (const s of p.sheets) {
      for (const c of s.chars) dropCharLabels(c, (l) => set.has(l));
      for (const id of set) {
        delete s.settings.labelPos[id];
        delete s.settings.zoneNameAng[id];
      }
      s.collapsed = s.collapsed.filter((l) => !set.has(l));
      const gone = (e: string) => grelEndIsLbl(e) && set.has(grelEndId(e));
      s.grels = s.grels.filter((g) => !gone(g.from) && !gone(g.to));
    }
  });
  pruneUi();
}

/** 收合／展開（只有陣營框標籤；每張分頁各自記） */
export function setCollapsed(lblId: number, on: boolean): void {
  const l = projectNow().labels.find((x) => x.id === lblId);
  if (on && !l?.zone) return;
  editSheet((s) => {
    const has = s.collapsed.includes(lblId);
    if (on && !has) s.collapsed.push(lblId);
    if (!on && has) s.collapsed = s.collapsed.filter((x) => x !== lblId);
  });
  if (on) {
    const u = useUi.getState();
    if (u.focus) setUi({ focus: null, hover: null });
  }
  pruneUi();
}

/** 標籤節點的位置（拖曳；呼叫端包成一步） */
export function setLabelPos(lblId: number, x: number, y: number): void {
  editSheet((s) => {
    s.settings.labelPos[lblId] = { x, y };
  });
}

/** 陣營名稱的方向（拖曳；呼叫端包成一步） */
export function setZoneNameAng(lblId: number, ang: number): void {
  editSheet((s) => {
    s.settings.zoneNameAng[lblId] = ang;
  });
}

/* ---------- 群體關係（第二批，F093） ---------- */

export function updateGrel(id: number, patch: Partial<Pick<GroupRel, 'inherit' | 'note'>>): void {
  editSheet((s) => {
    const g = s.grels.find((x) => x.id === id);
    if (g) Object.assign(g, patch);
  });
}

/** 例外：這個角色不適用（再按＝恢復適用） */
export function toggleGrelExcept(id: number, charId: number): void {
  editSheet((s) => {
    const g = s.grels.find((x) => x.id === id);
    if (!g) return;
    g.except = g.except.includes(charId)
      ? g.except.filter((x) => x !== charId)
      : [...g.except, charId];
  });
}

export function clearGrelExcept(id: number): void {
  editSheet((s) => {
    const g = s.grels.find((x) => x.id === id);
    if (g) g.except = [];
  });
}

export function deleteGrel(id: number): void {
  editSheet((s) => {
    s.grels = s.grels.filter((g) => g.id !== id);
  });
  pruneUi();
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
    /* 複製出來的是新的關係概念：不綁來源的關係庫變體（同步時收錄成新的一筆） */
    s.types.push({
      ...JSON.parse(JSON.stringify(src)),
      id: nid,
      lib: 0,
      vari: 0,
      label: copyTypeLabel(src.label, s.types as RelType[]),
    });
  });
  return nid;
}

export function deleteType(id: number): void {
  editSheet((s) => {
    s.types = s.types.filter((t) => t.id !== id);
    s.rels = s.rels.filter((r) => r.type !== id);
    s.grels = s.grels.filter((g) => g.type !== id);
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
  setUi({
    link: { typeId, from: null, made: [], madeG: [], flash: null },
    sel: [],
    focus: null,
  });
}

export const endLink = (): void => setUi({ link: null });

/** 端點還在嗎（角色在這張分頁、標籤在專案裡） */
function tokAlive(tok: string): boolean {
  if (!GREL_END_RE.test(tok)) return false;
  return grelEndIsLbl(tok)
    ? projectNow().labels.some((l) => l.id === grelEndId(tok))
    : activeSheet().chars.some((c) => c.id === grelEndId(tok));
}

/** 建立關係模式中點了一位角色（數字或 `C<id>`）或一個標籤（`L<id>`＝群體關係的端點） */
export function linkClick(target: number | string): void {
  const l = useUi.getState().link;
  if (!l) return;
  const s = activeSheet();
  if (!s.types.some((t) => t.id === l.typeId)) {
    endLink();
    return;
  }
  const tok = typeof target === 'number' ? `C${target}` : target;
  if (!tokAlive(tok)) return;
  if (l.from === null) {
    setUi({ link: { ...l, from: tok } });
    return;
  }
  if (l.from === tok) {
    setUi({ link: { ...l, from: null } });
    return;
  }
  if (!tokAlive(l.from)) {
    setUi({ link: { ...l, from: tok } });
    return;
  }
  if (grelEndIsLbl(l.from) || grelEndIsLbl(tok)) {
    linkGroup(l.from, tok);
    return;
  }
  const from = grelEndId(l.from);
  const to = grelEndId(tok);
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

/** 端點之一是標籤＝群體關係（同類同向已有：本輪建的＝取消、其他＝提示；反向的單向＝合併成雙向） */
function linkGroup(fromTok: string, toTok: string): void {
  const l = useUi.getState().link;
  if (!l) return;
  const s = activeSheet();
  const dup = s.grels.find(
    (g) =>
      g.type === l.typeId &&
      ((g.from === fromTok && g.to === toTok) || (g.both && g.from === toTok && g.to === fromTok)),
  );
  if (dup) {
    if (l.madeG.includes(dup.id)) {
      editSheet((d) => {
        d.grels = d.grels.filter((g) => g.id !== dup.id);
      });
      setUi({ link: { ...l, madeG: l.madeG.filter((x) => x !== dup.id) } });
      return;
    }
    linkFlash('這條關係已經存在了', false);
    return;
  }
  const rev = s.grels.find(
    (g) => g.type === l.typeId && !g.both && g.from === toTok && g.to === fromTok,
  );
  if (rev) {
    editSheet((d) => {
      const g = d.grels.find((x) => x.id === rev.id);
      if (g) g.both = true;
    });
    const ctx = sheetCtx(s, projectNow().labels);
    const nm = (t: string) =>
      grelEndIsLbl(t)
        ? (ctx.lblById.get(grelEndId(t))?.text ?? '')
        : displayName(ctx.byId.get(grelEndId(t)) as Char);
    linkFlash(`${nm(fromTok)} 與 ${nm(toTok)} 原本已有反向的同類關係，已合併成一條雙向線`, true);
    return;
  }
  let nid = 0;
  updateProject((p) => {
    const d = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    nid = takeId(p);
    d.grels.push({
      id: nid,
      from: fromTok,
      to: toTok,
      type: l.typeId,
      both: false,
      inherit: false,
      note: '',
      except: [],
    });
  });
  const cur = useUi.getState().link;
  if (cur) setUi({ link: { ...cur, madeG: [...cur.madeG, nid] } });
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
    const c0 = s.chars[0];
    const x0 = c0.x;
    const y0 = c0.y;
    const W0 = s.W;
    const H0 = s.H;
    fitCanvasToContent(ctxOf(s));
    /* 時間軸分頁：其他影格一起平移（7.4 第 12 項） */
    shiftOtherFrames(s as Sheet, s.chars[0].x - x0, s.chars[0].y - y0, W0, H0);
  });
  return true;
}

/** 修改畫布尺寸（rect＝新畫布在舊座標裡的位置與大小；時間軸分頁的其他影格一起平移，7.4 第 12 項） */
export function resizeCanvasTo(rect: { x: number; y: number; w: number; h: number }): void {
  editSheet((s) => {
    const W0 = s.W;
    const H0 = s.H;
    resizeCanvas(s as Sheet, rect);
    shiftOtherFrames(s as Sheet, -Math.round(rect.x), -Math.round(rect.y), W0, H0);
  });
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
