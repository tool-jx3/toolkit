/**
 * 使用者的動作（每個都是一步復原，除非另外註明）：範本、尺寸、邊距、裝飾、圖層、差分、字型、預覽背景。
 */
import { type FontValue, uploadFont } from '@/core/fonts';
import { loadImage } from '@/core/image';
import { resetToolStore } from '@/core/storage';
import {
  applyDesign,
  autoPlaceImage,
  clone,
  currentItem,
  type DecoType,
  imageLayer,
  type Layer,
  type Margin,
  newDecoration,
  newId,
  PALETTE_KEYS,
  type PaletteKey,
  textLayer,
  type VariantItem,
  type VariantKind,
  variantItems,
} from './model';
import { findDesign, SIZE_LIMITS } from './presets';
import {
  assets,
  bump,
  DEFAULT_PREVIEW,
  edit,
  frameNow,
  select,
  selectDeco,
  setStatus,
  type TabId,
  useFrame,
  usePreview,
  useSession,
} from './store';
import { S } from './strings';

export const setTab = (tab: TabId): void => usePreview.getState().patch({ tab });

/* ---------- 範本、尺寸、窗 ---------- */

export function applyDesignById(id: string): void {
  if (!findDesign(id)) return;
  edit((d) => {
    applyDesign(d, id);
  });
  selectDeco(null);
  setStatus(S.status.designApplied(S.designs[id]?.name ?? id), 'success');
}

export function setSize(w: number, h: number): void {
  const fix = (v: number) =>
    Math.round(Math.min(SIZE_LIMITS.max, Math.max(SIZE_LIMITS.min, Number.isFinite(v) ? v : 64)));
  const nw = fix(w);
  const nh = fix(h);
  const cur = frameNow().size;
  if (cur.w === nw && cur.h === nh) return;
  edit((d) => {
    d.size = { w: nw, h: nh };
  });
}

/** 邊距快速設定（F08）：四邊相同時同時打開「四邊共用」 */
export function applyLayout(margin: Margin): void {
  edit((d) => {
    d.opening.margin = { ...margin };
    d.opening.linkMargin = margin.t === margin.r && margin.r === margin.b && margin.b === margin.l;
  });
}

/** 四邊共用（F09）：從關閉切換成開啟時，四邊都改成目前的上邊距 */
export function setLinkMargin(on: boolean): void {
  edit((d) => {
    d.opening.linkMargin = on;
    if (on) {
      const t = d.opening.margin.t;
      d.opening.margin = { t, r: t, b: t, l: t };
    }
  });
}

/** 四角共用（F12）：從共用切換成個別時，四角都先複製成目前共用的設定 */
export function setLinkCorners(on: boolean): void {
  edit((d) => {
    d.opening.linkCorners = on;
    if (!on) d.opening.corners = [0, 1, 2, 3].map(() => ({ ...d.opening.corners[0] }));
  });
}

/** F14：改「目前的配色」（開了差分且目前差分有自己的顏色時改那個差分的） */
export function setPaletteColor(key: PaletteKey, value: string): void {
  const current = usePreview.getState().data.current;
  edit((d) => {
    const item = currentItem(d, current);
    if (d.variants.enabled && item?.useColors) item[key] = value;
    else d.palette[key] = value;
  });
}

/* ---------- 沿框裝飾 ---------- */

export function addDecoration(type: DecoType): void {
  const deco = newDecoration(type);
  edit((d) => {
    d.decorations.push(deco);
  });
  selectDeco(deco.id);
  setStatus(S.status.added(S.decoTypes[type]?.name ?? type), 'success');
}

/** 疊放順序：陣列後面＝畫面前方 */
export function moveInArray<T>(list: T[], index: number, delta: number): void {
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
}

export function moveDeco(id: string, delta: number): void {
  edit((d) => {
    moveInArray(
      d.decorations,
      d.decorations.findIndex((x) => x.id === id),
      delta,
    );
  });
}

export function reseedDeco(id: string): void {
  edit((d) => {
    const deco = d.decorations.find((x) => x.id === id);
    if (deco) deco.seed = (deco.seed | 0) + 1;
  });
}

/** 複製：在原裝飾的正上方插入設定相同、圖樣不同的複本並選取 */
export function duplicateDeco(id: string): void {
  const src = frameNow().decorations.find((x) => x.id === id);
  if (!src) return;
  const copy = { ...clone(src), id: newId('D'), seed: (src.seed | 0) + 7 };
  edit((d) => {
    const i = d.decorations.findIndex((x) => x.id === id);
    d.decorations.splice(i + 1, 0, copy);
  });
  selectDeco(copy.id);
}

export function removeDeco(id: string): void {
  const src = frameNow().decorations.find((x) => x.id === id);
  if (!src) return;
  edit((d) => {
    d.decorations = d.decorations.filter((x) => x.id !== id);
  });
  selectDeco(null);
  setStatus(S.status.removed(S.decoTypes[src.type]?.name ?? src.type), 'success');
}

/* ---------- 圖層 ---------- */

export function updateLayer(id: string, recipe: (l: Layer) => void): void {
  edit((d) => {
    const l = d.layers.find((x) => x.id === id);
    if (l) recipe(l);
  });
}

export function addTextLayer(): void {
  const layer = textLayer();
  edit((d) => {
    d.layers.push(layer);
  });
  select(layer.id);
}

const IMAGE_EXT = /\.(png|apng|jpe?g|webp|gif|avif|bmp|svg|ico)$/i;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
export const isFontFile = (f: File): boolean => FONT_EXT.test(f.name);
export const isProjectFile = (f: File): boolean => /\.json$/i.test(f.name);

/** 讀一張圖片放進資產庫；解碼失敗或沒有尺寸時 null */
async function addImageAsset(
  file: File,
): Promise<{ id: string; w: number; h: number; persisted: boolean } | null> {
  try {
    /* 先解碼確認是圖片（沒有寬高的 SVG 之類會失敗），再放進資產庫 */
    const probe = await loadImage(file);
    const ok = probe.width > 0 && probe.height > 0;
    probe.close?.();
    if (!ok) return null;
    const r = await assets.add(file);
    const bmp = await assets.bitmap(r.id);
    if (!bmp?.width || !bmp.height) return null;
    return { id: r.id, w: bmp.width, h: bmp.height, persisted: r.persisted };
  } catch {
    return null;
  }
}

/** F30：每張圖片成為一個圖層（名稱＝檔名去掉副檔名），比例接近畫布且夠大時拉伸鋪滿，否則縮到 40% 以內 */
export async function addImageFiles(files: File[]): Promise<void> {
  const list = files.filter(isImageFile);
  if (!list.length) return;
  const added: Layer[] = [];
  const failed: string[] = [];
  let notSaved = false;
  for (const file of list) {
    const r = await addImageAsset(file);
    if (!r) {
      failed.push(S.status.imageFailed(file.name || 'image'));
      continue;
    }
    if (!r.persisted) notSaved = true;
    const layer = imageLayer(r.id, (file.name || S.layer.defaultImageName).replace(/\.[^.]+$/, ''));
    const place = autoPlaceImage({ width: r.w, height: r.h }, frameNow().size);
    layer.fit = place.fit;
    if (place.fit === 'free') layer.scale = place.scale;
    added.push(layer);
  }
  if (added.length) {
    edit((d) => {
      d.layers.push(...added);
    });
    select(added[added.length - 1].id);
    setTab('layers');
    bump();
  }
  const parts = [
    ...(added.length ? [S.status.imagesAdded(added.length)] : []),
    ...failed,
    ...(notSaved ? [S.status.imageNotSaved] : []),
  ];
  setStatus(parts.join(''), failed.length ? 'danger' : notSaved ? 'warning' : 'success');
}

/** F46：在原圖層正上方插入名稱加「 的複本」、往右下各偏 2% 的複本並選取 */
export function duplicateLayer(id: string): void {
  const src = frameNow().layers.find((l) => l.id === id);
  if (!src) return;
  const copy: Layer = {
    ...clone(src),
    id: newId('L'),
    name: src.name + S.layer.copySuffix,
    x: src.x + 0.02,
    y: src.y + 0.02,
  };
  edit((d) => {
    const i = d.layers.findIndex((l) => l.id === id);
    d.layers.splice(i + 1, 0, copy);
  });
  select(copy.id);
}

export function removeLayer(id: string): void {
  if (!frameNow().layers.some((l) => l.id === id)) return;
  edit((d) => {
    d.layers = d.layers.filter((l) => l.id !== id);
  });
  select(null);
  setStatus(S.status.layerRemoved, 'success');
}

export function moveLayer(id: string, delta: number): void {
  edit((d) => {
    moveInArray(
      d.layers,
      d.layers.findIndex((l) => l.id === id),
      delta,
    );
  });
}

/* ---------- 差分 ---------- */

export const currentNow = (): VariantItem | null =>
  currentItem(frameNow(), usePreview.getState().data.current);

/** 切換目前差分（不列入復原） */
export function setCurrent(id: string): void {
  usePreview.getState().patch({ current: id });
}

export function updateVariant(id: string, recipe: (v: VariantItem) => void): void {
  edit((d) => {
    const v = d.variants.items.find((x) => x.id === id);
    if (v) recipe(v);
  });
}

/** F57：至少要有一個要匯出 */
export function setVariantExported(id: string, on: boolean): boolean {
  const items = frameNow().variants.items;
  if (!on && items.filter((i) => i.on).length <= 1 && items.find((i) => i.id === id)?.on) {
    setStatus(S.status.needOneExported, 'danger');
    return false;
  }
  updateVariant(id, (v) => {
    v.on = on;
  });
  return true;
}

export function moveVariant(id: string, delta: number): void {
  edit((d) => {
    moveInArray(
      d.variants.items,
      d.variants.items.findIndex((v) => v.id === id),
      delta,
    );
  });
}

/** F57：至少要留一個差分；刪掉目前差分時改選第一個要匯出的 */
export function removeVariant(id: string): void {
  const s = frameNow();
  const victim = s.variants.items.find((v) => v.id === id);
  if (!victim) return;
  if (s.variants.items.length <= 1) {
    setStatus(S.status.needOneVariant, 'danger');
    return;
  }
  const current = usePreview.getState().data.current;
  edit((d) => {
    d.variants.items = d.variants.items.filter((v) => v.id !== id);
    if (!d.variants.items.some((v) => v.on)) d.variants.items[0].on = true;
  });
  if (current === id || !currentNow()) {
    const items = frameNow().variants.items;
    setCurrent((items.find((v) => v.on) ?? items[0]).id);
  }
  setStatus(S.status.removed(victim.name || S.variant.noName), 'success');
}

/** F58：複製目前差分成新的一列，名稱與英文標示改成帶編號的預設名稱，設為要匯出並切換過去 */
export function addVariant(): void {
  const s = frameNow();
  const cur = currentNow();
  const n = s.variants.items.length + 1;
  const base = cur ? clone(cur) : null;
  const item: VariantItem = {
    ...(base ?? variantItems('custom', s)[0]),
    id: newId('v'),
    on: true,
    name: S.variant.newName(n),
    sub: S.variant.newSub(n),
  };
  edit((d) => {
    d.variants.items.push(item);
  });
  setCurrent(item.id);
  setStatus(S.status.variantAdded, 'success');
}

/** F56：換差分種類＝整批換掉差分清單，目前差分改成第一個要匯出的 */
export function changeKind(kind: VariantKind): void {
  const items = variantItems(kind, frameNow());
  edit((d) => {
    d.variants.kind = kind;
    d.variants.items = items;
  });
  setCurrent((items.find((i) => i.on) ?? items[0]).id);
  setStatus(S.status.kindChanged(S.variantKinds[kind]?.name ?? kind), 'success');
}

/** F64：目前差分的「自己的顏色」與四色複製到所有差分 */
export function copyColorsToAll(): void {
  const cur = currentNow();
  if (!cur) return;
  edit((d) => {
    for (const item of d.variants.items) {
      item.useColors = cur.useColors;
      for (const k of PALETTE_KEYS) item[k] = cur[k];
    }
  });
  setStatus(S.status.colorsCopied(cur.name || S.variant.noName), 'success');
}

export async function setVariantIconImage(id: string, file: File): Promise<void> {
  const r = await addImageAsset(file);
  if (!r) {
    setStatus(S.status.imageFailed(file.name || 'image'), 'danger');
    return;
  }
  updateVariant(id, (v) => {
    v.iconAsset = r.id;
    v.icon = 'custom';
  });
  bump();
}

/* ---------- 預覽背景圖（不列入復原、不畫進輸出） ---------- */

export async function setPreviewBgImage(file: File): Promise<void> {
  const r = await addImageAsset(file);
  if (!r) {
    setStatus(S.status.imageFailed(file.name || 'image'), 'danger');
    return;
  }
  usePreview.getState().patch({ bgAsset: r.id, bg: 'image' });
  bump();
  setStatus(S.status.bgImageSet, 'success');
}

export function removePreviewBgImage(): void {
  const p = usePreview.getState().data;
  usePreview.getState().patch({ bgAsset: null, bg: p.bg === 'image' ? 'scenery' : p.bg });
  setStatus(S.status.bgImageRemoved, 'success');
}

/* ---------- 字型（不列入復原；存在共用字型庫） ---------- */

/** F72：讀不到的字型顯示錯誤、不加入清單（第 7 節裁定修正） */
export async function addFontFiles(files: File[]): Promise<FontValue['family'][]> {
  const list = files.filter(isFontFile);
  const families: string[] = [];
  const failed: string[] = [];
  for (const f of list) {
    try {
      families.push((await uploadFont(f)).family);
    } catch {
      failed.push(f.name);
    }
  }
  if (failed.length) setStatus(failed.map((n) => S.status.fontFailed(n)).join(''), 'danger');
  else if (families.length) setStatus(S.status.fontsLoaded(families.length), 'success');
  if (families.length) bump();
  return families;
}

/* ---------- 全部重來 ---------- */

/** F87：設定、圖層、差分、圖片、預覽背景回到初始狀態並清空復原紀錄（上傳字型留在共用字型庫） */
export async function resetEverything(): Promise<void> {
  resetToolStore(useFrame);
  const tab = usePreview.getState().data.tab;
  usePreview.getState().replace({ ...DEFAULT_PREVIEW, tab });
  useSession.setState({ selected: null, decoSelected: null });
  await assets.clear().catch(() => undefined);
  bump();
  setStatus(S.status.reset, 'success');
}
