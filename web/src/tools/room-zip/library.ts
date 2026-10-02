/**
 * 跨專案的範本與收藏（瀏覽器內）：圖片的存取（libAssets）、部件範本（F168）、棋子範本（F256）、演出預設（F266）、
 * 切入範本（F237）、最愛（F070、F071）、範本檔的匯出與讀取（F267、3.5）。
 */
import { downloadText } from '@/core/files';
import { addMaterial } from './actions';
import { importFiles } from './importer';
import { tagFromLabel } from './materials';
import {
  type Cutin,
  type Material,
  newEntityId,
  newLocalId,
  type Part,
  type Piece,
  type SceneTemplate,
  type Tag,
} from './model';
import {
  assets,
  type CutinTemplate,
  commit,
  commitLibrary,
  type EffectPreset,
  type Favorite,
  type KpTemplate,
  type LayoutEntry,
  type Library,
  libAssets,
  type PartTemplate,
  type PieceTemplate,
  patchLibrary,
  putBlob,
  useBlobs,
  useLibrary,
  useProject,
  useSettings,
} from './store';

/* ---------- 圖片 ---------- */

/** 把素材的圖存進瀏覽器的範本圖庫（同名＝同內容） */
export async function saveImageToLibrary(name: string | null | undefined): Promise<boolean> {
  if (!name) return false;
  const blob = await assets.get(name);
  if (!blob) return false;
  await libAssets.put(name, blob);
  const url = await libAssets.url(name);
  if (url) useBlobs.setState((s) => ({ lib: { ...s.lib, [name]: url } }));
  return true;
}

/** 範本的圖不在本專案時，從瀏覽器保存的圖加回素材（保留同一個檔名）；回傳能不能用 */
export async function ensureMaterial(
  name: string | null | undefined,
  meta: Partial<Material> = {},
): Promise<boolean> {
  if (!name) return false;
  const p = useProject.getState().data;
  if (p.materials.some((m) => m.name === name)) return true;
  const blob = (await libAssets.get(name)) ?? (await assets.get(name));
  if (!blob) return false;
  await putBlob(name, blob);
  let w = meta.width ?? 0;
  let h = meta.height ?? 0;
  if (!w) {
    try {
      const bmp = await createImageBitmap(blob);
      w = bmp.width;
      h = bmp.height;
      bmp.close();
    } catch {
      /* 尺寸未知 */
    }
  }
  const m: Material = {
    name,
    label: meta.label || name.slice(0, 8),
    tags: meta.tags?.length ? meta.tags : ['other'],
    animated: meta.animated ?? /\.gif$/.test(name),
    originalName: meta.originalName || meta.label || name,
    mime: blob.type || meta.mime || 'image/png',
    before: blob.size,
    after: blob.size,
    width: w,
    height: h,
  };
  commit((d) => {
    addMaterial(d, m);
  });
  return true;
}

const labelOf = (name: string | null | undefined): string =>
  (name && useProject.getState().data.materials.find((m) => m.name === name)?.label) || '';
const materialOf = (name: string | null | undefined) =>
  name ? useProject.getState().data.materials.find((m) => m.name === name) : undefined;

/* ---------- 部件範本（F168） ---------- */

export function partTemplateFrom(part: Part, name: string): PartTemplate {
  const m = materialOf(part.imageUrl);
  return {
    id: newLocalId('pt'),
    kind: part.kind,
    name,
    x: part.x,
    y: part.y,
    width: part.width,
    height: part.height,
    z: part.z,
    lockAspect: part.lockAspect,
    locked: part.locked,
    visible: part.visible,
    text: part.text,
    imageUrl: part.imageUrl ?? '',
    imageLabel: m?.label ?? '',
    imageWidth: m?.width ?? 0,
    imageHeight: m?.height ?? 0,
  };
}

/** 同種類同名的部件範本 */
export const findPartTemplate = (kind: Part['kind'], name: string) =>
  useLibrary.getState().data.partTemplates.find((t) => t.kind === kind && t.name === name);

export async function savePartTemplate(tpl: PartTemplate, replaceId?: string): Promise<void> {
  await saveImageToLibrary(tpl.imageUrl);
  commitLibrary((lib) => ({
    ...lib,
    partTemplates: replaceId
      ? lib.partTemplates.map((t) => (t.id === replaceId ? { ...tpl, id: replaceId } : t))
      : [...lib.partTemplates, tpl],
  }));
}

/** 從部件範本加入：圖片不在本專案就自動加入素材；部件加在最上面，回傳新部件的 id */
export async function addPartFromTemplate(id: string): Promise<string | null> {
  const t = useLibrary.getState().data.partTemplates.find((x) => x.id === id);
  if (!t) return null;
  await ensureMaterial(t.imageUrl, {
    label: t.imageLabel || t.name,
    width: t.imageWidth,
    height: t.imageHeight,
    tags: [t.kind === 'panel' ? 'panel' : 'other'],
  });
  const part: Part = {
    id: newEntityId(),
    kind: t.kind,
    name: t.name,
    imageUrl: t.imageUrl || null,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    z: t.z,
    locked: t.locked,
    lockAspect: t.lockAspect,
    visible: t.visible,
    text: t.text,
  };
  commit((d) => {
    d.parts.unshift(part);
  });
  return part.id;
}

/* ---------- 棋子範本（F256） ---------- */

export function pieceTemplateFrom(c: Piece, name: string): PieceTemplate {
  return {
    id: newLocalId('ct'),
    name,
    kind: c.kind === 'kp' ? 'normal' : c.kind,
    iconUrl: c.iconUrl,
    hp: c.hp,
    mp: c.mp,
    faces: c.faces.map((f) => ({ label: f.label, iconUrl: f.iconUrl })),
    armor: c.armor,
    dodge: c.dodge,
    noDodge: c.noDodge,
    skills: c.skills.map(({ name: n, value, damage }) => ({ name: n, value, damage })),
    commands: c.commands,
    memo: c.memo,
  };
}

export async function savePieceTemplate(tpl: PieceTemplate, replaceId?: string): Promise<void> {
  for (const n of [tpl.iconUrl, ...tpl.faces.map((f) => f.iconUrl)]) await saveImageToLibrary(n);
  commitLibrary((lib) => ({
    ...lib,
    pieceTemplates: replaceId
      ? lib.pieceTemplates.map((t) => (t.id === replaceId ? { ...tpl, id: replaceId } : t))
      : [...lib.pieceTemplates, tpl],
  }));
}

/** 加入（複製成新棋子加在最後；圖片若不在本專案就加回素材） */
export async function addPieceFromTemplate(id: string): Promise<void> {
  const t = useLibrary.getState().data.pieceTemplates.find((x) => x.id === id);
  if (!t) return;
  for (const n of [t.iconUrl, ...t.faces.map((f) => f.iconUrl)])
    await ensureMaterial(n, { label: t.name, tags: ['icon'] });
  const c: Piece = {
    id: newEntityId(),
    kind: t.kind,
    name: t.name,
    iconUrl: t.iconUrl,
    hp: t.hp,
    mp: t.mp,
    faces: t.faces.map((f) => ({ id: newLocalId('f'), ...f })),
    armor: t.armor,
    dodge: t.dodge,
    noDodge: t.noDodge,
    skills: t.skills.map((s) => ({ id: newLocalId('s'), ...s })),
    commands: t.commands,
    memo: t.memo,
  };
  commit((d) => void d.pieces.push(c));
}

/* ---------- 演出預設（F266）與切入範本（F237） ---------- */

export const presetItems = (lib: Library = useLibrary.getState().data): EffectPreset[] =>
  lib.effectPresets.flatMap((e) => (e.type === 'item' ? [e.item] : []));
export const cutinTemplateItems = (lib: Library = useLibrary.getState().data): CutinTemplate[] =>
  lib.cutinTemplates.flatMap((e) => (e.type === 'item' ? [e.item] : []));

/** 登錄或覆蓋演出預設（加在最上面） */
export async function saveEffectPreset(
  p: Omit<EffectPreset, 'id' | 'imageLabel'>,
  replaceId?: string,
): Promise<void> {
  await saveImageToLibrary(p.imageUrl);
  const item: EffectPreset = {
    ...p,
    id: replaceId ?? newLocalId('ep'),
    imageLabel: labelOf(p.imageUrl),
  };
  commitLibrary((lib) => ({
    ...lib,
    effectPresets: replaceId
      ? lib.effectPresets.map((e) =>
          e.type === 'item' && e.item.id === replaceId ? { type: 'item', item } : e,
        )
      : [{ type: 'item', item }, ...lib.effectPresets],
  }));
}

export function updateEffectPreset(id: string, patch: Partial<EffectPreset>): void {
  commitLibrary((lib) => ({
    ...lib,
    effectPresets: lib.effectPresets.map((e) =>
      e.type === 'item' && e.item.id === id ? { type: 'item', item: { ...e.item, ...patch } } : e,
    ),
  }));
}

export async function setEffectPresetImage(id: string, name: string | null): Promise<void> {
  await saveImageToLibrary(name);
  updateEffectPreset(id, { imageUrl: name, imageLabel: labelOf(name) });
}

/** 收進切入範本（同名覆蓋時給 replaceId） */
export async function saveCutinTemplate(c: Cutin, replaceId?: string): Promise<void> {
  await saveImageToLibrary(c.imageUrl);
  const item: CutinTemplate = {
    id: replaceId ?? newLocalId('cu'),
    name: c.name,
    imageUrl: c.imageUrl,
    imageLabel: labelOf(c.imageUrl),
  };
  commitLibrary((lib) => ({
    ...lib,
    cutinTemplates: replaceId
      ? lib.cutinTemplates.map((e) =>
          e.type === 'item' && e.item.id === replaceId ? { type: 'item', item } : e,
        )
      : [...lib.cutinTemplates, { type: 'item', item }],
  }));
}

export function updateCutinTemplate(id: string, patch: Partial<CutinTemplate>): void {
  commitLibrary((lib) => ({
    ...lib,
    cutinTemplates: lib.cutinTemplates.map((e) =>
      e.type === 'item' && e.item.id === id ? { type: 'item', item: { ...e.item, ...patch } } : e,
    ),
  }));
}

/** 清單（含分隔）的拖曳排序：from 移到 to 的前面或後面 */
export function moveEntry<T>(
  list: LayoutEntry<T>[],
  from: number,
  to: number,
  after: boolean,
): LayoutEntry<T>[] {
  if (from === to) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  let at = to > from ? to - 1 : to;
  if (after) at += 1;
  out.splice(Math.max(0, Math.min(out.length, at)), 0, x);
  return out;
}

export const entryId = <T extends { id: string }>(e: LayoutEntry<T>): string =>
  e.type === 'item' ? e.item.id : e.id;

/* ---------- 最愛（F070、F071） ---------- */

export async function addFavorite(m: Material): Promise<void> {
  await saveImageToLibrary(m.name);
  const fav: Favorite = {
    name: m.name,
    label: m.label,
    tags: m.tags,
    mime: m.mime,
    originalName: m.originalName,
  };
  patchLibrary((lib) => ({
    ...lib,
    favorites: [...lib.favorites.filter((f) => f.name !== m.name), fav],
  }));
}

export function removeFavorite(name: string): void {
  patchLibrary((lib) => ({ ...lib, favorites: lib.favorites.filter((f) => f.name !== name) }));
}

/** 放進本專案：照一般匯入規則加入，再還原名稱與標籤 */
export async function takeFavorite(f: Favorite): Promise<string | null> {
  const blob = await libAssets.get(f.name);
  if (!blob) return null;
  const r = await importFiles(
    [new File([blob], f.originalName || `${f.label}.png`, { type: blob.type || f.mime })],
    {
      label: f.label,
      tags: f.tags,
    },
  );
  const name = r.names[0] ?? null;
  if (name)
    commit((d) => {
      const m = d.materials.find((x) => x.name === name);
      if (m) {
        m.label = f.label;
        m.tags = f.tags;
      }
    });
  return name;
}

/* ---------- 範本檔（F267、3.5） ---------- */

export const TEMPLATE_FILE_FORMAT = 'trpg-toolkit-room-zip-templates';

export interface TemplateFile {
  format: typeof TEMPLATE_FILE_FORMAT;
  version: 1;
  sceneTemplates: SceneTemplate[];
  effectPresets: LayoutEntry<EffectPreset>[];
  cutinTemplates: LayoutEntry<CutinTemplate>[];
  kpTemplates: KpTemplate[];
  sites: { name: string; url: string }[];
  symbols: string;
  defaults: ReturnType<typeof useSettings.getState>['data']['defaults'];
}

export function exportTemplates(): void {
  const lib = useLibrary.getState().data;
  const st = useSettings.getState().data;
  const file: TemplateFile = {
    format: TEMPLATE_FILE_FORMAT,
    version: 1,
    sceneTemplates: useProject.getState().data.sceneTemplates,
    effectPresets: lib.effectPresets,
    cutinTemplates: lib.cutinTemplates,
    kpTemplates: lib.kpTemplates,
    sites: st.sites.map(({ name, url }) => ({ name, url })),
    symbols: st.symbols,
    defaults: st.defaults,
  };
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  downloadText(
    JSON.stringify(file, null, 2),
    `room-zip-templates_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`,
    'application/json',
  );
}

/** 讀取範本檔：全部追加並換新 id；回傳加了幾個（讀不了時丟錯） */
export function importTemplates(text: string): number {
  const raw = JSON.parse(text) as Partial<TemplateFile>;
  if (!raw || raw.format !== TEMPLATE_FILE_FORMAT) throw new Error('format');
  let n = 0;
  const fresh = <T extends { id: string }>(e: LayoutEntry<T>): LayoutEntry<T> =>
    e.type === 'item'
      ? { type: 'item', item: { ...e.item, id: newLocalId('t') } }
      : { ...e, id: newLocalId('sep') };
  const scenes = Array.isArray(raw.sceneTemplates) ? raw.sceneTemplates : [];
  if (scenes.length)
    commit((d) => {
      for (const t of scenes)
        d.sceneTemplates.push({
          ...t,
          id: newEntityId(),
          markers: (t.markers ?? []).map((m) => ({ ...m, id: newEntityId() })),
        });
    });
  n += scenes.length;
  const ep = Array.isArray(raw.effectPresets) ? raw.effectPresets.map(fresh) : [];
  const ct = Array.isArray(raw.cutinTemplates) ? raw.cutinTemplates.map(fresh) : [];
  const kp = Array.isArray(raw.kpTemplates)
    ? raw.kpTemplates.map((t) => ({ ...t, id: newLocalId('kt') }))
    : [];
  n +=
    ep.filter((e) => e.type === 'item').length +
    ct.filter((e) => e.type === 'item').length +
    kp.length;
  if (ep.length || ct.length || kp.length)
    commitLibrary((lib) => ({
      ...lib,
      effectPresets: [...lib.effectPresets, ...ep],
      cutinTemplates: [...lib.cutinTemplates, ...ct],
      kpTemplates: [...lib.kpTemplates, ...kp],
    }));
  const st = useSettings.getState().data;
  const sites = Array.isArray(raw.sites) ? raw.sites.filter((s) => s?.url) : [];
  if (sites.length)
    useSettings.getState().patch({
      sites: [
        ...st.sites,
        ...sites.map((s) => ({
          id: newLocalId('site'),
          name: String(s.name ?? ''),
          url: String(s.url),
        })),
      ],
    });
  return n;
}

/** 素材標籤（匯入舊資料時可能是名稱） */
export const normalizeTags = (tags: unknown): Tag[] =>
  Array.isArray(tags) ? tags.map((t) => tagFromLabel(String(t))).filter((t): t is Tag => !!t) : [];
