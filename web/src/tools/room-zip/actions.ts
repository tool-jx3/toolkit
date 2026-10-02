/**
 * 專案的操作（不依賴 React）：介面的每個按鈕都呼叫這裡的函式（在 store.update 的 Immer 草稿上改），
 * 單元測試也用同一套函式重現附件的操作序列（Z01～Z11）。
 */
import { roundGrid } from '@/ccfolia';
import {
  createEffectMarker,
  createPart,
  effectRect,
  fixAspect,
  freezeFullEffect,
  layoutTachie,
  type MaterialLookup,
  materialLookup,
  type NewPartOptions,
  syncTachie,
  tachieBase,
  tachieById,
  tachieFamily,
  tachieMarker,
} from './geometry';
import { replaceImageRefs } from './materials';
import {
  type Cutin,
  createCutin,
  createPiece,
  createScene,
  effectiveDefaults,
  type FullFit,
  gridPos,
  gridSize,
  type Material,
  NAMES,
  newEntityId,
  newLocalId,
  type Part,
  type PartKind,
  type PartOverride,
  type Piece,
  type PieceKind,
  type Project,
  type Scene,
  type SceneMarker,
  type TachieEntry,
  type Tag,
  type ToolSettings,
  toNumber,
} from './model';
import { applyTemplate as applySceneTemplate } from './scenes';

export interface Ctx {
  /** 素材名稱 → 素材（寬高比用） */
  find: MaterialLookup;
  tool: ToolSettings;
}

export const ctxOf = (p: Project, tool: ToolSettings): Ctx => ({
  find: materialLookup(p.materials),
  tool,
});
export const defaultsOf = (p: Project, ctx: Ctx) => effectiveDefaults(p.room, ctx.tool.defaults);
const gapOf = (ctx: Ctx) => toNumber(ctx.tool.tachieGap, 0);

/** 每次變更後：立繪庫的變更傳到場景（F233、D5） */
export function finalize(p: Project, ctx: Ctx): void {
  syncTachie(p, ctx.find, defaultsOf(p, ctx).z.tachie);
}

/* ---------- 素材 ---------- */

/** 加入素材：內容（名稱）相同就算合併（F040）；回傳 'added' 或 'dup' */
export function addMaterial(p: Project, m: Material): 'added' | 'dup' {
  if (p.materials.some((x) => x.name === m.name)) return 'dup';
  p.materials.push(m);
  return 'added';
}

/** 匯入結束時房間背景是空的：設成素材一覽中第一張帶「前景」標籤的素材（F043） */
export function autoRoomBackground(p: Project): void {
  if (p.room.backgroundUrl) return;
  const fg = p.materials.find((m) => m.tags.includes('fg'));
  if (fg) p.room.backgroundUrl = fg.name;
}

/** 刪除素材（D2：引用一併清掉，刪除的素材不再收進 ZIP） */
export function deleteMaterials(p: Project, names: readonly string[]): void {
  const set = new Set(names);
  p.materials = p.materials.filter((m) => !set.has(m.name));
  for (const n of set) replaceImageRefs(p, n, null);
}

export function setMaterialTags(p: Project, name: string, tags: Tag[]): void {
  const m = p.materials.find((x) => x.name === name);
  if (m) m.tags = tags.length ? tags : ['other'];
}

export type CreateKind = 'scene' | 'tachie' | 'marker' | 'panel' | 'cutin';

/**
 * 以素材建立（F061、F173）：場景依順序加在最後（每張一個場景，名稱＝素材名，前景＝該素材）；
 * 立繪、部件、切入加在清單最上面且保持順序（第一張在最上面）。回傳建立的 id（依順序）。
 */
export function createFromMaterials(
  p: Project,
  kind: CreateKind,
  names: readonly string[],
  ctx: Ctx,
): string[] {
  const mats = names
    .map((n) => p.materials.find((m) => m.name === n))
    .filter((m): m is Material => !!m);
  const ids: string[] = [];
  if (kind === 'scene') {
    for (const m of mats) {
      const s = createScene(m.label, p.room, m.name);
      p.scenes.push(s);
      ids.push(s.id);
    }
    return ids;
  }
  for (const m of [...mats].reverse()) {
    if (kind === 'tachie')
      ids.unshift(addTachie(p, { character: '', expression: m.label, imageUrl: m.name }, ctx).id);
    else if (kind === 'cutin') {
      const c = createCutin(m.label, m.name);
      p.cutins.unshift(c);
      ids.unshift(c.id);
    } else ids.unshift(addPart(p, { kind, name: m.label, imageUrl: m.name }, ctx).id);
  }
  return ids;
}

/* ---------- 房間設計 ---------- */

/** 立繪預設大小（F141）：立繪庫裡所有主立繪（與單獨設定的差分）的高度一起改成這個值 */
export function setTachieDefaultHeight(p: Project, h: number): void {
  const v = gridSize(h, 18);
  p.room.tachieHeight = v;
  for (const t of p.tachie) if (!t.baseId || t.solo) t.height = v;
}

/* ---------- 部件 ---------- */

/** 新部件加在清單最上面 */
export function addPart(p: Project, opt: NewPartOptions, ctx: Ctx): Part {
  const part = createPart(opt, p.room, defaultsOf(p, ctx), ctx.find);
  p.parts.unshift(part);
  return part;
}

/** 立繪尺寸的共用標記（F162）：13×18、置中、堆疊順序＝立繪初始值 */
export const addTachieSizedPart = (p: Project, ctx: Ctx): Part =>
  addPart(p, { kind: 'marker', width: 13, height: 18, z: defaultsOf(p, ctx).z.tachie }, ctx);

export const partById = (p: Project, id: string) => p.parts.find((x) => x.id === id);

/** 改部件的欄位（位置與大小取整數格；固定長寬比時改寬→高跟著變、改高→寬跟著變；換圖時以寬重算高） */
export function updatePart(p: Project, id: string, patch: Partial<Part>, ctx: Ctx): void {
  const part = partById(p, id);
  if (!part) return;
  Object.assign(part, patch);
  for (const k of ['x', 'y'] as const) if (k in patch) part[k] = gridPos(part[k]);
  for (const k of ['width', 'height'] as const) if (k in patch) part[k] = gridSize(part[k]);
  if ('z' in patch) part.z = toNumber(part.z, 0);
  if ('imageUrl' in patch) fixAspect(part, 'image', ctx.find);
  else if ('width' in patch) fixAspect(part, 'width', ctx.find);
  else if ('height' in patch) fixAspect(part, 'height', ctx.find);
  else if ('lockAspect' in patch && part.lockAspect) fixAspect(part, 'width', ctx.find);
}

/** 在清單中上移／下移（只在同種類間交換，F164） */
export function movePart(p: Project, id: string, dir: -1 | 1): void {
  const i = p.parts.findIndex((x) => x.id === id);
  if (i < 0) return;
  const kind = p.parts[i].kind;
  for (let j = i + dir; j >= 0 && j < p.parts.length; j += dir) {
    if (p.parts[j].kind === kind) {
      [p.parts[i], p.parts[j]] = [p.parts[j], p.parts[i]];
      return;
    }
  }
}

export function switchPartKind(p: Project, id: string): PartKind | null {
  const part = partById(p, id);
  if (!part) return null;
  part.kind = part.kind === 'panel' ? 'marker' : 'panel';
  return part.kind;
}

/** 複製（加在最上面，名稱加複本後綴，位置 +1,+1） */
export function duplicatePart(p: Project, id: string): Part | null {
  const part = partById(p, id);
  if (!part) return null;
  const c: Part = {
    ...part,
    id: newEntityId(),
    name: `${part.name}${NAMES.copySuffix}`,
    x: part.x + 1,
    y: part.y + 1,
  };
  p.parts.unshift(c);
  return c;
}

/** 刪除（同時刪除所有場景對它的差異） */
export function deletePart(p: Project, id: string): void {
  p.parts = p.parts.filter((x) => x.id !== id);
  for (const s of [...p.scenes, ...p.sceneTemplates]) delete s.overrides[id];
}

/* ---------- 立繪庫 ---------- */

export interface NewTachie {
  character?: string;
  expression?: string;
  imageUrl?: string | null;
  height?: number;
}

/** 新立繪加在最上面（高度＝本專案或共用的立繪初始值） */
export function addTachie(p: Project, opt: NewTachie, ctx: Ctx): TachieEntry {
  const d = defaultsOf(p, ctx);
  const tc: TachieEntry = {
    id: newEntityId(),
    character: opt.character ?? '',
    expression: opt.expression ?? NAMES.tachie,
    imageUrl: opt.imageUrl ?? null,
    height: gridSize(opt.height ?? (d.tachieH || p.room.tachieHeight || 18), 18),
    dy: 0,
    z: null,
    baseId: null,
    solo: false,
  };
  p.tachie.unshift(tc);
  return tc;
}

/** 做表情差分（F229）：加在最後；主立繪＝原立繪的主立繪；表情名稱加差分後綴 */
export function createTachieFace(p: Project, id: string): TachieEntry | null {
  const src = tachieById(p, id);
  if (!src) return null;
  const face: TachieEntry = {
    ...src,
    id: newEntityId(),
    expression: `${src.expression || NAMES.tachie}${NAMES.faceSuffix}`,
    baseId: src.baseId || src.id,
    solo: false,
  };
  p.tachie.push(face);
  return face;
}

/** 複製（整張複製成獨立的一張，加在最上面，表情名稱加複本後綴） */
export function duplicateTachie(p: Project, id: string, ctx: Ctx): TachieEntry | null {
  const src = tachieById(p, id);
  if (!src) return null;
  const base = tachieBase(p, src);
  const s = base && !src.solo ? base : src;
  const c: TachieEntry = {
    ...src,
    id: newEntityId(),
    expression: `${src.expression || NAMES.tachie}${NAMES.copySuffix}`,
    baseId: null,
    solo: false,
    height: s.height,
    dy: s.dy,
    z: s.z,
  };
  p.tachie.unshift(c);
  finalize(p, ctx);
  return c;
}

/** 刪除（同時從所有場景退場；它的差分改成獨立的一張） */
export function deleteTachie(p: Project, id: string): void {
  const tc = tachieById(p, id);
  if (!tc) return;
  for (const x of p.tachie) {
    if (x.baseId === id) {
      x.baseId = null;
      if (!x.solo) {
        x.height = tc.height;
        x.dy = tc.dy;
        x.z = tc.z;
      }
      x.solo = false;
    }
  }
  p.tachie = p.tachie.filter((x) => x.id !== id);
  for (const s of p.scenes) s.markers = s.markers.filter((m) => m.refId !== id);
}

/** 差分「單獨設定」（F230）：勾的當下把主立繪的高度、抬升、堆疊順序複製過來 */
export function setTachieSolo(p: Project, id: string, on: boolean): void {
  const tc = tachieById(p, id);
  if (!tc) return;
  tc.solo = on;
  const b = tachieBase(p, tc);
  if (on && b) {
    tc.height = b.height;
    tc.dy = b.dy || 0;
    tc.z = b.z;
  }
}

export type TachieBulkKey = 'height' | 'dy' | 'z';

/** 批次設定（F227）：只改主立繪與單獨設定的差分；回傳改了幾張 */
export function applyTachieBulk(p: Project, key: TachieBulkKey, value: number): number {
  let n = 0;
  for (const t of p.tachie) {
    if (t.baseId && !t.solo) continue;
    if (key === 'height') t.height = gridSize(value, 18);
    else if (key === 'dy') t.dy = gridPos(value);
    else t.z = toNumber(value, 0);
    n++;
  }
  return n;
}

/* ---------- 場景 ---------- */

export const sceneById = (p: Project, id: string | null | undefined) =>
  id ? p.scenes.find((s) => s.id === id) : undefined;

/** 快速建立（F171）：加在最後；名稱空白用預設名 */
export function addScene(p: Project, name: string, foregroundUrl: string | null): Scene {
  const s = createScene(name.trim() || NAMES.scene, p.room, foregroundUrl);
  p.scenes.push(s);
  return s;
}

/**
 * 登場勾選（F192）：勾＝這個角色（主立繪）登場；取消＝主立繪與其差分都退場。登場、退場後重新等距排列。
 */
export function setTachieAppear(
  p: Project,
  sceneId: string,
  mainId: string,
  on: boolean,
  ctx: Ctx,
): void {
  const s = sceneById(p, sceneId);
  const tc = tachieById(p, mainId);
  if (!s || !tc) return;
  const fam = new Set(tachieFamily(p, tc).map((x) => x.id));
  const placed = s.markers.some((m) => m.kind === 'tachie' && m.refId && fam.has(m.refId));
  if (on && !placed) s.markers.push(tachieMarker(p, tc, ctx.find, defaultsOf(p, ctx).z.tachie));
  if (!on && placed)
    s.markers = s.markers.filter((m) => !(m.kind === 'tachie' && m.refId && fam.has(m.refId)));
  layoutTachie(s, p.room, gapOf(ctx));
}

/** 換差分（F193）：保留水平位置；圖、寬高、垂直位置、堆疊順序改用該差分的值 */
export function setTachieFace(
  p: Project,
  sceneId: string,
  markerId: string,
  tachieId: string,
  ctx: Ctx,
): void {
  const s = sceneById(p, sceneId);
  const m = s?.markers.find((x) => x.id === markerId);
  const tc = tachieById(p, tachieId);
  if (!s || !m || !tc) return;
  const fresh = tachieMarker(p, tc, ctx.find, defaultsOf(p, ctx).z.tachie);
  Object.assign(m, { ...fresh, id: m.id, x: m.x });
}

/** 和左側／右側鄰近的立繪對調 x 位置（依目前 x 排序找鄰居） */
export function swapTachie(p: Project, sceneId: string, markerId: string, dir: -1 | 1): void {
  const s = sceneById(p, sceneId);
  if (!s) return;
  const list = s.markers.filter((m) => m.kind === 'tachie').sort((a, b) => (a.x || 0) - (b.x || 0));
  const at = list.findIndex((m) => m.id === markerId);
  const other = list[at + dir];
  if (at < 0 || !other) return;
  const m = list[at];
  [m.x, other.x] = [other.x, m.x];
}

/** 等距排列（F194） */
export function layoutScene(p: Project, sceneId: string, ctx: Ctx): void {
  const s = sceneById(p, sceneId);
  if (s) layoutTachie(s, p.room, gapOf(ctx));
}

/** 改登場立繪的位置或大小（大小＝高度，寫到主立繪〔所有場景〕） */
export function updateSceneTachie(
  p: Project,
  sceneId: string,
  markerId: string,
  patch: { x?: number; y?: number; height?: number },
  ctx: Ctx,
): void {
  const s = sceneById(p, sceneId);
  const m = s?.markers.find((x) => x.id === markerId);
  if (!m) return;
  if (patch.x !== undefined) m.x = gridPos(patch.x);
  if (patch.y !== undefined) m.y = gridPos(patch.y);
  if (patch.height !== undefined && m.refId) {
    const tc = tachieById(p, m.refId);
    if (tc) {
      const b = tachieBase(p, tc);
      const src = b && !tc.solo ? b : tc;
      src.height = gridSize(patch.height, 18);
      finalize(p, ctx);
    }
  }
}

/** 演出預設（工具設定）裡加入演出時需要的欄位 */
export interface EffectPresetLike {
  name: string;
  imageUrl: string | null;
  text: string;
  kind: 'full' | 'free';
  z: number;
  width: number;
  height: number;
  fullFit?: FullFit;
}

/** 加入演出（F195）：新建＝全畫面、等比蓋滿、沒有圖、堆疊順序＝演出初始值；從預設加入＝預設的內容 */
export function addEffect(
  p: Project,
  sceneId: string,
  preset: EffectPresetLike | null,
  ctx: Ctx,
): SceneMarker | null {
  const s = sceneById(p, sceneId);
  if (!s) return null;
  const z = defaultsOf(p, ctx).z.effect;
  const m = preset
    ? createEffectMarker(preset.z ?? z, {
        kind: preset.kind === 'full' ? 'full' : 'free',
        name: preset.name,
        imageUrl: preset.imageUrl,
        text: preset.text ?? '',
        width: preset.width || 6,
        height: preset.height || 6,
        fullFit: preset.fullFit || 'cover',
      })
    : createEffectMarker(z, { name: NAMES.effect });
  s.markers.push(m);
  return m;
}

export const effectById = (s: Scene | undefined, id: string) => s?.markers.find((m) => m.id === id);

/** 改演出的欄位；出現方式從全畫面切成調整大小時大小沿用、固定長寬比關（5.） */
export function updateEffect(
  p: Project,
  sceneId: string,
  id: string,
  patch: Partial<SceneMarker>,
  ctx: Ctx,
): void {
  const s = sceneById(p, sceneId);
  const m = effectById(s, id);
  if (!s || !m) return;
  if (patch.kind && patch.kind !== m.kind) {
    if (m.kind === 'full' && patch.kind === 'free') freezeFullEffect(m, s, ctx.find);
    m.kind = patch.kind;
  }
  const { kind: _k, ...rest } = patch;
  Object.assign(m, rest);
  for (const k of ['x', 'y'] as const) if (k in rest) m[k] = gridPos(m[k]);
  for (const k of ['width', 'height'] as const) if (k in rest) m[k] = gridSize(m[k]);
  if ('z' in rest) m.z = toNumber(m.z, 0);
  if (m.kind !== 'free') return;
  if ('imageUrl' in rest) fixAspect(m, 'image', ctx.find);
  else if ('width' in rest) fixAspect(m, 'width', ctx.find);
  else if ('height' in rest) fixAspect(m, 'height', ctx.find);
  else if ('lockAspect' in rest && m.lockAspect) fixAspect(m, 'width', ctx.find);
}

/** 複製演出（加在這個場景演出清單的最前面，名稱加複本後綴） */
export function duplicateEffect(p: Project, sceneId: string, id: string): SceneMarker | null {
  const s = sceneById(p, sceneId);
  const m = effectById(s, id);
  if (!s || !m) return null;
  const c: SceneMarker = { ...m, id: newEntityId(), name: `${m.name}${NAMES.copySuffix}` };
  const first = s.markers.findIndex((x) => x.kind !== 'tachie');
  s.markers.splice(first < 0 ? s.markers.length : first, 0, c);
  return c;
}

export function deleteSceneMarker(p: Project, sceneId: string, id: string): void {
  const s = sceneById(p, sceneId);
  if (s) s.markers = s.markers.filter((m) => m.id !== id);
}

/** 全畫面演出目前的實際大小（顯示用） */
export const effectSize = (m: SceneMarker, s: Scene, ctx: Ctx) => effectRect(m, s, ctx.find);

/**
 * 指定切入（F201）：選既有的＝指定它；新建＝在切入清單最後新增一個預設名的切入並指定。
 */
export function assignCutin(p: Project, sceneId: string, choice: 'new' | string): Cutin | null {
  const s = sceneById(p, sceneId);
  if (!s) return null;
  let c: Cutin | undefined;
  if (choice === 'new') {
    c = createCutin(NAMES.sceneCutin);
    p.cutins.push(c);
  } else c = p.cutins.find((x) => x.id === choice);
  if (!c) return null;
  s.cutinId = c.id;
  return c;
}

export function deleteCutin(p: Project, id: string): void {
  p.cutins = p.cutins.filter((c) => c.id !== id);
  for (const s of [...p.scenes, ...p.sceneTemplates]) if (s.cutinId === id) s.cutinId = null;
}

/** 新增切入（預設名、沒有圖，加在最上面） */
export function addCutin(
  p: Project,
  name: string = NAMES.cutin,
  imageUrl: string | null = null,
): Cutin {
  const c = createCutin(name, imageUrl);
  p.cutins.unshift(c);
  return c;
}

/* ---------- 共用部件的差異 ---------- */

/**
 * 改場景差異（F205、F206）：值為 undefined（清空欄位）＝取消該項差異；全部取消後整筆刪掉。
 * 位置與大小取整數格。
 */
export function setOverride(
  p: Project,
  sceneId: string,
  partId: string,
  patch: PartOverride,
): void {
  const s = sceneById(p, sceneId);
  if (!s) return;
  const o: PartOverride = { ...(s.overrides[partId] ?? {}) };
  for (const [k, v] of Object.entries(patch) as [keyof PartOverride, unknown][]) {
    if (v === undefined) delete o[k];
    else if (k === 'x' || k === 'y') o[k] = gridPos(v);
    else if (k === 'width' || k === 'height') o[k] = gridSize(v);
    else if (k === 'z') o.z = toNumber(v, 0);
    else (o as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(o).length) s.overrides[partId] = o;
  else delete s.overrides[partId];
}

/** 回到預設：清除這個場景對它的所有差異 */
export function clearOverride(p: Project, sceneId: string, partId: string): void {
  const s = sceneById(p, sceneId);
  if (s) delete s.overrides[partId];
}

/* ---------- 棋子 ---------- */

/** 加入棋子（加在清單最後） */
export function addPiece(p: Project, kind: Exclude<PieceKind, 'kp'>): Piece {
  const c = createPiece(kind);
  p.pieces.push(c);
  return c;
}

export function addPieceFace(p: Project, id: string): void {
  const c = p.pieces.find((x) => x.id === id);
  if (c)
    c.faces.push({ id: newLocalId('f'), label: NAMES.face(c.faces.length + 1), iconUrl: null });
}

export function addSkill(p: Project, id: string): void {
  const c = p.pieces.find((x) => x.id === id);
  if (c) c.skills.push({ id: newLocalId('s'), name: '', value: '', damage: '' });
}

/* ---------- 其他 ---------- */

/** 盤面大小（F136、F137；只影響之後新建的場景） */
export function setFieldSize(p: Project, w: number, h: number): void {
  p.room.fieldWidth = Math.max(1, roundGrid(w));
  p.room.fieldHeight = Math.max(1, roundGrid(h));
}

/** 素材的立即使用（F064）：指定給目前場景當前景 */
export function setSceneForeground(p: Project, sceneId: string, name: string | null): void {
  const s = sceneById(p, sceneId);
  if (s) s.foregroundUrl = name;
}

/** 以範本新建場景（加在最後；名稱＝範本名，再套用全部） */
export function sceneFromTemplate(p: Project, tplId: string, ctx: Ctx): Scene | null {
  const tp = p.sceneTemplates.find((t) => t.id === tplId);
  if (!tp) return null;
  const s = createScene(tp.name || NAMES.template, p.room, null);
  applySceneTemplate(tp, s, p.room, gapOf(ctx));
  p.scenes.push(s);
  return s;
}
