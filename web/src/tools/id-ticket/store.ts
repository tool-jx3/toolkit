/**
 * 狀態與動作：
 * - useDoc：類別、範本、證件與票券的欄位、樣式、照片、收據品項、票券配色（自動儲存、可以復原；文字欄從聚焦到離開、
 *   滑桿放開才記一步）；
 * - usePrefs：分頁、顯示的面、掛繩、匯出設定（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（調整照片範圍的對話框）；
 * - 照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { clampPlacement, DEFAULT_PLACEMENT, type FramePlacement } from '@/core/image';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  CAPTION_MAX,
  cleanValue,
  generateCode,
  ID_EXPORT_MODES,
  ID_FACES,
  ID_ZOOM_MAX,
  type IdExportMode,
  type IdFaces,
  type IdTicketState,
  ITEM_NAME_MAX,
  initialState,
  type Kind,
  newItemId,
  normalizeState,
  oneLine,
  type Photo,
  PRICE_RANGE,
  QTY_RANGE,
  type ReceiptItem,
  type Side,
  stateAssetIds,
  TICKET_ZOOM_MAX,
} from './model';
import type { TabId } from './strings';
import {
  type FieldDef,
  ID_DEFAULTS,
  type IdTemplateId,
  idTemplate,
  RECEIPT_ITEM_MAX,
  type TicketTemplateId,
  ticketTemplate,
} from './templates';

export const TOOL_ID = 'id-ticket';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<IdTicketState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄、拖曳顏色：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): IdTicketState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: IdTicketState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as IdTicketState);
  });
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: IdTicketState = initialState()): void {
  useDoc.getState().replace(next);
}

/* ---------- 不列入復原的設定 ---------- */

export type TicketFormat = 'png' | 'gif';
export const PNG_SCALES = [1, 2, 3] as const;
export const GIF_LONGS = [1400, 1000, 700] as const;

export interface Prefs {
  tab: TabId;
  side: Side;
  strap: boolean;
  idMode: IdExportMode;
  idFaces: IdFaces;
  ticketFormat: TicketFormat;
  pngScale: number;
  mat: boolean;
  gifLong: number;
  /** GIF 的播放次數（0＝無限循環） */
  plays: number;
}

export const initialPrefs = (): Prefs => ({
  tab: 'content',
  side: 'front',
  strap: true,
  idMode: 'card',
  idFaces: 'current',
  ticketFormat: 'png',
  pngScale: 2,
  mat: true,
  gifLong: 1400,
  plays: 0,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const d = initialPrefs();
  const fixed: Prefs = {
    tab: p.tab === 'style' ? 'style' : 'content',
    side: p.side === 'back' ? 'back' : 'front',
    strap: typeof p.strap === 'boolean' ? p.strap : d.strap,
    idMode: ID_EXPORT_MODES.includes(p.idMode) ? p.idMode : d.idMode,
    idFaces: ID_FACES.includes(p.idFaces) ? p.idFaces : d.idFaces,
    ticketFormat: p.ticketFormat === 'gif' ? 'gif' : 'png',
    pngScale: (PNG_SCALES as readonly number[]).includes(p.pngScale) ? p.pngScale : d.pngScale,
    mat: typeof p.mat === 'boolean' ? p.mat : d.mat,
    gifLong: (GIF_LONGS as readonly number[]).includes(p.gifLong) ? p.gifLong : d.gifLong,
    plays:
      typeof p.plays === 'number' && Number.isFinite(p.plays)
        ? Math.max(0, Math.min(99, Math.round(p.plays)))
        : 0,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 介面狀態 ---------- */

export interface FrameRequest {
  bitmap: ImageBitmap;
  photo: Photo;
  aspect: number;
  circle: boolean;
  maxZoom: number;
}

export const useUi = create<{ frame: FrameRequest | null }>(() => ({ frame: null }));

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export const referencedImages = (): Set<string> => referencedAssetIds(useDoc, stateAssetIds);

/* ---------- 類別與範本 ---------- */

export function setKind(kind: Kind): void {
  if (docNow().kind === kind) return;
  edit((d) => {
    d.kind = kind;
  });
}

/** 換證件範本：回到正面（同原作） */
export function setIdTemplate(id: IdTemplateId): void {
  setPrefs({ side: 'front' });
  if (docNow().idTemplate === id) return;
  edit((d) => {
    d.idTemplate = id;
  });
}

export function setTicketTemplate(id: TicketTemplateId): void {
  if (docNow().ticketTemplate === id) return;
  edit((d) => {
    d.ticketTemplate = id;
  });
}

/* ---------- 欄位 ---------- */

/** 目前範本的欄位定義 */
export function currentFields(d: IdTicketState = docNow()): readonly FieldDef[] {
  return d.kind === 'id'
    ? idTemplate(d.idTemplate).fields
    : ticketTemplate(d.ticketTemplate).fields;
}

export function fieldDef(key: string, d: IdTicketState = docNow()): FieldDef | undefined {
  return currentFields(d).find((f) => f.key === key);
}

/** 改目前範本的一個欄位 */
export function setValue(key: string, raw: string): void {
  const f = fieldDef(key);
  if (!f) return;
  const v = cleanValue(f, raw);
  edit((d) => {
    if (d.kind === 'id') d.idValues[key] = v;
    else d.ticketValues[d.ticketTemplate][key] = v;
  });
}

export function fieldValue(key: string, d: IdTicketState = docNow()): string {
  return d.kind === 'id'
    ? (d.idValues[key] ?? '')
    : (d.ticketValues[d.ticketTemplate]?.[key] ?? '');
}

/** 重新產生一個編號欄位（沒有格式的欄位不做事） */
export function regenerate(key: string, rand: () => number = Math.random): void {
  const f = fieldDef(key);
  if (!f?.gen) return;
  setValue(key, generateCode(f.gen, rand));
}

/** 重新產生目前範本所有的編號欄位（一步復原） */
export function regenerateAll(rand: () => number = Math.random): void {
  const fields = currentFields().filter((f) => f.gen);
  if (!fields.length) return;
  edit((d) => {
    for (const f of fields) {
      const v = cleanValue(f, generateCode(f.gen as string, rand));
      if (d.kind === 'id') d.idValues[f.key] = v;
      else d.ticketValues[d.ticketTemplate][f.key] = v;
    }
  });
}

/** 清空目前範本的欄位（同原作的「全部清空」） */
export function clearFields(): void {
  const fields = currentFields();
  edit((d) => {
    for (const f of fields) {
      if (d.kind === 'id') d.idValues[f.key] = '';
      else d.ticketValues[d.ticketTemplate][f.key] = '';
    }
  });
}

/** 目前範本的欄位填回範例 */
export function fillSample(): void {
  const d0 = docNow();
  const fields = currentFields(d0);
  edit((d) => {
    if (d.kind === 'id') for (const f of fields) d.idValues[f.key] = ID_DEFAULTS[f.key] ?? '';
    else {
      const t = ticketTemplate(d.ticketTemplate);
      for (const f of fields) d.ticketValues[t.id][f.key] = t.defaults[f.key] ?? '';
      if (t.id === 'receipt') d.receiptItems = initialState().receiptItems;
    }
  });
}

/** 票上畫的欄位名稱 */
export function setCaption(key: string, raw: string): void {
  edit((d) => {
    d.ticketCaptions[d.ticketTemplate][key] = oneLine(raw, CAPTION_MAX);
  });
}

export function resetCaption(key: string): void {
  edit((d) => {
    delete d.ticketCaptions[d.ticketTemplate][key];
  });
}

/* ---------- 樣式 ---------- */

export function setIdStyle(patch: Partial<IdTicketState['idStyles'][IdTemplateId]>): void {
  edit((d) => {
    Object.assign(d.idStyles[d.idTemplate], patch);
  });
}

export function setTheme(patch: Partial<IdTicketState['theme']>): void {
  edit((d) => {
    Object.assign(d.theme, patch);
  });
}

/* ---------- 照片 ---------- */

/** 目前範本的照片格（沒有照片格時 null） */
export function photoSlot(d: IdTicketState = docNow()) {
  if (d.kind === 'id') {
    const t = idTemplate(d.idTemplate);
    return {
      aspect: t.photo.w / t.photo.h,
      circle: !!t.photo.circle,
      maxZoom: ID_ZOOM_MAX,
      box: { width: t.photo.w, height: t.photo.h },
    };
  }
  const t = ticketTemplate(d.ticketTemplate);
  if (!t.photo || (t.id === 'receipt' && !d.receiptPhoto)) return null;
  return {
    aspect: t.photoAspect,
    circle: false,
    maxZoom: TICKET_ZOOM_MAX,
    box: { width: t.photoAspect * 100, height: 100 },
  };
}

export function currentPhoto(d: IdTicketState = docNow()): Photo | null {
  return d.kind === 'id' ? d.idPhoto : (d.ticketPhotos[d.ticketTemplate] ?? null);
}

function writePhoto(d: IdTicketState, p: Photo | null): void {
  if (d.kind === 'id') d.idPhoto = p;
  else if (p) d.ticketPhotos[d.ticketTemplate] = p;
  else delete d.ticketPhotos[d.ticketTemplate];
}

/** 放入新照片：蓋滿、置中（同原作） */
export function applyPhoto(image: Photo['image']): void {
  edit((d) => writePhoto(d, { image, place: { ...DEFAULT_PLACEMENT } }));
}

export function setPhotoPlace(place: FramePlacement): void {
  const slot = photoSlot();
  edit((d) => {
    const p = currentPhoto(d);
    if (!p) return;
    writePhoto(d, {
      image: p.image,
      place: slot
        ? clampPlacement(
            { width: p.image.width, height: p.image.height },
            slot.box,
            place,
            slot.maxZoom,
          )
        : place,
    });
  });
}

/** 縮放（以框的中心縮放，位移跟著等比例，再夾回蓋滿的範圍） */
export function setPhotoZoom(zoom: number): void {
  const p = currentPhoto();
  if (!p) return;
  const k = zoom / (p.place.zoom || 1);
  setPhotoPlace({ ...p.place, zoom, x: p.place.x * k, y: p.place.y * k });
}

export function resetPhotoPlace(): void {
  setPhotoPlace({ ...DEFAULT_PLACEMENT });
}

export function removePhoto(): void {
  edit((d) => writePhoto(d, null));
}

export function setReceiptPhoto(on: boolean): void {
  edit((d) => {
    d.receiptPhoto = on;
  });
}

/* ---------- 收據 ---------- */

export function addItem(name: string): string | null {
  if (docNow().receiptItems.length >= RECEIPT_ITEM_MAX) return null;
  const id = newItemId();
  edit((d) => {
    d.receiptItems.push({ id, name: oneLine(name, ITEM_NAME_MAX), qty: 1, price: 0 });
  });
  return id;
}

export function removeItem(id: string): void {
  edit((d) => {
    d.receiptItems = d.receiptItems.filter((x) => x.id !== id);
  });
}

export function patchItem(id: string, patch: Partial<Omit<ReceiptItem, 'id'>>): void {
  edit((d) => {
    const it = d.receiptItems.find((x) => x.id === id);
    if (!it) return;
    if (patch.name !== undefined) it.name = oneLine(patch.name, ITEM_NAME_MAX);
    if (patch.qty !== undefined)
      it.qty = Math.round(Math.min(QTY_RANGE.max, Math.max(QTY_RANGE.min, patch.qty)));
    if (patch.price !== undefined)
      it.price =
        Math.round(Math.min(PRICE_RANGE.max, Math.max(PRICE_RANGE.min, patch.price)) * 100) / 100;
  });
}
