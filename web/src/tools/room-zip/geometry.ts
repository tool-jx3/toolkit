/**
 * 房間 ZIP 產生器的幾何規則（不依賴 React）：立繪的寬高與垂直位置、等距排列、全畫面演出的大小、
 * 固定長寬比、部件的初始大小、場景差異套用後的共用標記。規格 3.2.1、3.2.4、3.2.6、3.2.7、F161～F163。
 */
import { roundGrid } from '@/ccfolia';
import {
  type EffectiveDefaults,
  type FullFit,
  gridSize,
  type Material,
  newEntityId,
  type Part,
  type PartKind,
  type PartOverride,
  type Project,
  type RoomDesign,
  type Scene,
  type SceneMarker,
  type TachieEntry,
} from './model';

/** 素材名稱 → 素材（找不到時 undefined） */
export type MaterialLookup = (name: string | null | undefined) => Material | undefined;

export function materialLookup(materials: readonly Material[]): MaterialLookup {
  const map = new Map(materials.map((m) => [m.name, m]));
  return (name) => (name ? map.get(name) : undefined);
}

/** 圖片的寬高比（寬÷高）；沒有圖或尺寸未知時 null */
export function imageAspect(name: string | null | undefined, find: MaterialLookup): number | null {
  const m = find(name);
  return m && m.width > 0 && m.height > 0 ? m.width / m.height : null;
}

/* ---------- 立繪 ---------- */

/** 沒有圖時的立繪寬高比 */
export const TACHIE_DEFAULT_ASPECT = 0.72;

export function tachieById(project: Pick<Project, 'tachie'>, id: string | null | undefined) {
  return id ? project.tachie.find((t) => t.id === id) : undefined;
}

/** 表情差分的主立繪（自己就是主立繪時 undefined） */
export function tachieBase(
  project: Pick<Project, 'tachie'>,
  tc: TachieEntry,
): TachieEntry | undefined {
  if (!tc.baseId) return undefined;
  const b = tachieById(project, tc.baseId);
  return b && b.id !== tc.id ? b : undefined;
}

/** 大小、抬升、堆疊順序的來源：差分沒有「單獨設定」時沿用主立繪 */
export function tachieSource(project: Pick<Project, 'tachie'>, tc: TachieEntry): TachieEntry {
  const b = tachieBase(project, tc);
  return b && !tc.solo ? b : tc;
}

/** 主立繪＋它的差分（依立繪庫的順序） */
export function tachieFamily(project: Pick<Project, 'tachie'>, tc: TachieEntry): TachieEntry[] {
  const rootId = tc.baseId && tachieById(project, tc.baseId) ? tc.baseId : tc.id;
  return project.tachie.filter((x) => x.id === rootId || x.baseId === rootId);
}

/** 立繪的寬高（格）：高＝主立繪（或單獨設定）的高；寬＝四捨五入(高 × 圖片寬高比)，至少 1（3.2.6） */
export function tachieSize(
  project: Pick<Project, 'tachie'>,
  tc: TachieEntry,
  find: MaterialLookup,
): { width: number; height: number } {
  const src = tachieSource(project, tc);
  const height = gridSize(src.height, 18);
  const aspect = imageAspect(tc.imageUrl, find) ?? TACHIE_DEFAULT_ASPECT;
  return { width: Math.max(1, roundGrid(height * aspect)), height };
}

/** 立繪的堆疊順序：自己（或主立繪）的值，沒有時用專案的立繪初始值 */
export function tachieZ(
  project: Pick<Project, 'tachie'>,
  tc: TachieEntry,
  zTachie: number,
): number {
  const src = tachieSource(project, tc);
  return src.z != null ? src.z : zTachie;
}

/**
 * 登場時的垂直位置（中心 y，3.2.6）：L＝基準線、H＝高度、D＝腳底抬升。
 * 靠下、指定位置：L − H/2 − D；靠上：L ＋ H/2 ＋ D；置中：L ＋ D（取整）。
 */
export function tachieY(room: RoomDesign, height: number, dy: number): number {
  const L = Number(room.tachieBaseline);
  const line = Number.isFinite(L) ? L : room.fieldHeight / 2;
  if (room.tachieAlign === 'top') return roundGrid(line + height / 2 + dy);
  if (room.tachieAlign === 'center') return roundGrid(line + dy);
  return roundGrid(line - height / 2 - dy);
}

/** 決定垂直位置的條件（變了就重算，D5） */
export function tachieYSig(room: RoomDesign, height: number, dy: number): string {
  return `${height}|${dy}|${room.tachieBaseline}|${room.tachieAlign}`;
}

/** 「指定位置」模式的水平中心 */
export const tachieDefaultX = (room: RoomDesign): number =>
  room.tachieAlign === 'position' ? roundGrid(Number(room.tachieX) || 0) : 0;

/** 立繪登場的マーカー（位置之後由 layoutTachie 排） */
export function tachieMarker(
  project: Pick<Project, 'tachie' | 'room'>,
  tc: TachieEntry,
  find: MaterialLookup,
  zTachie: number,
): SceneMarker {
  const { width, height } = tachieSize(project, tc, find);
  const src = tachieSource(project, tc);
  const dy = Number(src.dy) || 0;
  return {
    id: newEntityId(),
    kind: 'tachie',
    refId: tc.id,
    name: tachieLabel(tc),
    imageUrl: tc.imageUrl,
    text: '',
    x: tachieDefaultX(project.room),
    y: tachieY(project.room, height, dy),
    width,
    height,
    z: tachieZ(project, tc, zTachie),
    fullFit: 'cover',
    lockAspect: true,
    ySig: tachieYSig(project.room, height, dy),
  };
}

/** 立繪在清單、場景裡的名稱：表情名稱，沒有時角色名稱 */
export const tachieLabel = (tc: TachieEntry): string => tc.expression || tc.character || '';
/** 登場勾選鈕的名稱：角色名稱，沒有時表情名稱 */
export const tachieChipLabel = (tc: TachieEntry): string => tc.character || tc.expression || '';

/**
 * 等距排列（3.2.6）：把場景裡的立繪依清單順序由左到右排開，總寬＝各寬度合計＋間隔×(數量−1)，
 * 整排的中心在 x＝0（指定位置模式時在指定的水平位置），每個的中心取整。
 */
export function layoutTachie(scene: Scene, room: RoomDesign, gap: number): void {
  const list = scene.markers.filter((m) => m.kind === 'tachie');
  if (!list.length) return;
  const g = Number.isFinite(gap) ? gap : 0;
  const total =
    list.reduce((s, m) => s + (Number(m.width) || 0), 0) + g * Math.max(0, list.length - 1);
  let left = tachieDefaultX(room) - total / 2;
  for (const m of list) {
    const w = Number(m.width) || 0;
    m.x = roundGrid(left + w / 2);
    left += w + g;
  }
}

/**
 * 立繪庫的變更傳到每個場景（F233＋D5）：登場中的立繪換成庫裡的圖、名稱、寬高、堆疊順序；
 * 水平位置不變；高度、抬升、基準線或對齊方式改了才重算垂直位置。也套用到場景範本裡的立繪。
 */
export function syncTachie(project: Project, find: MaterialLookup, zTachie: number): void {
  const apply = (m: SceneMarker) => {
    if (m.kind !== 'tachie' || !m.refId) return;
    const tc = tachieById(project, m.refId);
    if (!tc) return;
    const { width, height } = tachieSize(project, tc, find);
    const src = tachieSource(project, tc);
    const dy = Number(src.dy) || 0;
    const sig = tachieYSig(project.room, height, dy);
    m.name = tachieLabel(tc);
    m.imageUrl = tc.imageUrl;
    m.width = width;
    m.height = height;
    m.z = tachieZ(project, tc, zTachie);
    if (m.ySig !== sig) {
      m.y = tachieY(project.room, height, dy);
      m.ySig = sig;
    }
  };
  for (const s of project.scenes) s.markers.forEach(apply);
  for (const t of project.sceneTemplates) t.markers.forEach(apply);
}

/* ---------- 演出 ---------- */

/**
 * 全畫面演出的位置與大小（3.2.7）：中心 (0,0)；W、H＝場景的前景尺寸，a＝圖片寬高比（沒有圖時 W/H）。
 * 蓋滿：寬 W、高 round(W/a)，高 < H 時改高 H、寬 round(H×a)；拉伸：W+1 × H+1；
 * 完整放入：寬 W、高 round(W/a)，高 > H 時改高 H、寬 round(H×a)。
 */
export function fullEffectSize(
  fit: FullFit,
  fieldW: number,
  fieldH: number,
  aspect: number | null,
): { x: number; y: number; width: number; height: number } {
  const a = aspect ?? fieldW / fieldH;
  if (fit === 'stretch') return { x: 0, y: 0, width: fieldW + 1, height: fieldH + 1 };
  let w = fieldW;
  let h = roundGrid(fieldW / a);
  if (fit === 'contain' ? h > fieldH : h < fieldH) {
    h = fieldH;
    w = roundGrid(fieldH * a);
  }
  return { x: 0, y: 0, width: w, height: h };
}

/** 場景裡演出的實際位置與大小（全畫面的依場景的前景尺寸重算） */
export function effectRect(
  m: SceneMarker,
  scene: Pick<Scene, 'fieldWidth' | 'fieldHeight'>,
  find: MaterialLookup,
): { x: number; y: number; width: number; height: number } {
  if (m.kind === 'full')
    return fullEffectSize(
      m.fullFit,
      scene.fieldWidth,
      scene.fieldHeight,
      imageAspect(m.imageUrl, find),
    );
  return { x: m.x, y: m.y, width: m.width, height: m.height };
}

/** 新的演出（全畫面、等比蓋滿、沒有圖） */
export function createEffectMarker(z: number, patch: Partial<SceneMarker> = {}): SceneMarker {
  return {
    id: newEntityId(),
    kind: 'full',
    refId: null,
    name: '演出',
    imageUrl: null,
    text: '',
    x: 0,
    y: 0,
    width: 6,
    height: 6,
    z,
    fullFit: 'cover',
    lockAspect: true,
    ...patch,
  };
}

/** 把全畫面演出的大小寫進資料（切成「調整大小」前用；之後固定長寬比是關的，見 5.） */
export function freezeFullEffect(
  m: SceneMarker,
  scene: Pick<Scene, 'fieldWidth' | 'fieldHeight'>,
  find: MaterialLookup,
): void {
  const r = effectRect(m, scene, find);
  m.x = r.x;
  m.y = r.y;
  m.width = r.width;
  m.height = r.height;
  m.lockAspect = false;
}

/* ---------- 固定長寬比 ---------- */

interface Sized {
  imageUrl: string | null;
  width: number;
  height: number;
  lockAspect: boolean;
}

/**
 * 固定長寬比（F154、F166）：changed＝'width' 或 'image' 時以寬重算高，'height' 時以高重算寬；
 * 沒有圖或沒有固定長寬比時不變。
 */
export function fixAspect(
  o: Sized,
  changed: 'width' | 'height' | 'image',
  find: MaterialLookup,
): void {
  const a = imageAspect(o.imageUrl, find);
  if (!a || !o.lockAspect) return;
  if (changed === 'height') o.width = Math.max(1, roundGrid(o.height * a));
  else o.height = Math.max(1, roundGrid(o.width / a));
}

/* ---------- 部件 ---------- */

/** 房間前景的寬高比（沒有前景時 null） */
export function foregroundAspect(room: RoomDesign, find: MaterialLookup): number | null {
  return imageAspect(room.foregroundUrl, find);
}

/**
 * 新部件的大小（F161、F163）：共用標記＝初始大小（正方形）；螢幕面板的寬＝「螢幕面板寬度」，0 時盤面寬 − 3（至少 4），
 * 高＝寬 ÷（房間前景的長寬比，沒有時盤面比例），至少 2。
 */
export function newPartSize(
  kind: PartKind,
  room: RoomDesign,
  d: EffectiveDefaults,
  find: MaterialLookup,
): { width: number; height: number } {
  if (kind === 'marker') {
    const s = gridSize(d.part, 4);
    return { width: s, height: s };
  }
  const w = d.panelW > 0 ? gridSize(d.panelW, 4) : Math.max(4, roundGrid(room.fieldWidth - 3));
  const a = foregroundAspect(room, find) ?? room.fieldWidth / room.fieldHeight;
  return { width: w, height: Math.max(2, roundGrid(w / a)) };
}

export interface NewPartOptions {
  kind: PartKind;
  name?: string;
  imageUrl?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
}

/** 新部件：位置 (0,0)、初始大小、對應的堆疊順序初始值、可見、固定長寬比；有圖時依長寬比以寬重算高 */
export function createPart(
  opt: NewPartOptions,
  room: RoomDesign,
  d: EffectiveDefaults,
  find: MaterialLookup,
): Part {
  const size = newPartSize(opt.kind, room, d, find);
  const p: Part = {
    id: newEntityId(),
    kind: opt.kind,
    name: opt.name ?? (opt.kind === 'panel' ? '螢幕面板' : '共用標記'),
    imageUrl: opt.imageUrl ?? null,
    x: opt.x ?? 0,
    y: opt.y ?? 0,
    width: opt.width ?? size.width,
    height: opt.height ?? size.height,
    z: opt.z ?? (opt.kind === 'panel' ? d.z.panel : d.z.part),
    locked: false,
    lockAspect: true,
    visible: true,
    text: '',
  };
  if (p.imageUrl) fixAspect(p, 'width', find);
  return p;
}

/** 場景差異套用後的共用標記（hidden＝本場景隱藏）；螢幕面板不套用差異 */
export interface EffectivePart {
  part: Part;
  imageUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  hidden: boolean;
  override: PartOverride | undefined;
}

export function effectivePart(part: Part, scene: Scene | null | undefined): EffectivePart {
  const o = part.kind === 'marker' ? scene?.overrides[part.id] : undefined;
  const has = <K extends keyof PartOverride>(k: K) =>
    !!o && Object.hasOwn(o, k) && o[k] !== undefined;
  return {
    part,
    imageUrl: has('imageUrl') ? (o?.imageUrl ?? null) : part.imageUrl,
    x: has('x') ? Number(o?.x) : part.x,
    y: has('y') ? Number(o?.y) : part.y,
    width: has('width') ? Number(o?.width) : part.width,
    height: has('height') ? Number(o?.height) : part.height,
    z: has('z') ? Number(o?.z) : part.z,
    hidden: !!o?.hidden,
    override: o,
  };
}

/** 差異的種類（F205 的狀態標籤） */
export function overrideKinds(
  o: PartOverride | undefined,
): ('hidden' | 'image' | 'position' | 'size' | 'z')[] {
  if (!o) return [];
  if (o.hidden) return ['hidden'];
  const out: ('image' | 'position' | 'size' | 'z')[] = [];
  if (o.imageUrl !== undefined) out.push('image');
  if (o.x !== undefined || o.y !== undefined) out.push('position');
  if (o.width !== undefined || o.height !== undefined) out.push('size');
  if (o.z !== undefined) out.push('z');
  return out;
}

/** 這個差異有沒有實際內容（全部空白＝沒有差異） */
export const hasOverride = (o: PartOverride | undefined): boolean => overrideKinds(o).length > 0;

/** 共用標記在各場景的使用狀況（F167）：隱藏、換圖、位置不同的場景名稱 */
export function partSceneUsage(project: Pick<Project, 'scenes'>, partId: string) {
  const hidden: string[] = [];
  const image: string[] = [];
  const moved: string[] = [];
  for (const s of project.scenes) {
    const o = s.overrides[partId];
    if (!o) continue;
    if (o.hidden) hidden.push(s.name);
    else {
      if (o.imageUrl !== undefined) image.push(s.name);
      if (o.x !== undefined || o.y !== undefined || o.width !== undefined || o.height !== undefined)
        moved.push(s.name);
    }
  }
  return { hidden, image, moved };
}
