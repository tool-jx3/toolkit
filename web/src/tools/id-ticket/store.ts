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
import { LANYARD_MODES, type LanyardMode } from './lanyard';
import {
  CAPTION_MAX,
  cardUnits,
  cleanValue,
  generateCode,
  ID_EXPORT_MODES,
  ID_FACES,
  ID_ZOOM_MAX,
  type IdDecor,
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
  QTY_RANGE,
  type ReceiptItem,
  roundPrice,
  type Side,
  stateAssetIds,
  TICKET_ZOOM_MAX,
} from './model';
import type { PhotoFx } from './photofx';
import { GIF_LONG_OPTIONS } from './render';
import { SF_LICENSES_DEFAULT, type SfBlankId, sfBlank, sfCaptionMax } from './sf/defs';
import { sfPortrait } from './sf/draw';
import { LICENSE_CAP_MAX } from './sf/licenses';
import {
  type CropFrac,
  ELEMENT_SIZE_RANGE,
  newElementId,
  SF_ELEMENT_MAX,
  SF_ZOOM_MAX,
  type SfElement,
  type SfState,
  type SfStyle,
  type SfWatermark,
  sfGenerate,
  sfValueDefaults,
  WHOLE,
} from './sf/model';
import { isSfNameRegion, type SfName, type SfNameGender, type SfNameRegion } from './sf/names';
import { normalizePresets, presetAssetIds, type SfPreset } from './sf/presets';
import { SF_SCALES, type SfCodeBox } from './sf/render';
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
/**
 * 專案檔與自動儲存的資料版本（2：加 SF 證件、證件照片的效果；3：SF 證件的條碼種類、晶片、日期格式、效果、數位證件，
 * 證件的浮水印與裝飾圖；1、2 的照讀）
 */
export const DATA_VERSION = 3;

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
export const GIF_LONGS = GIF_LONG_OPTIONS;

export interface Prefs {
  tab: TabId;
  side: Side;
  /** 掛繩（證件與 SF 證件共用；以前的 strap：true＝'preview'、false＝'none'） */
  lanyard: LanyardMode;
  /** SF 證件 PNG 的倍率 */
  sfScale: number;
  idMode: IdExportMode;
  idFaces: IdFaces;
  ticketFormat: TicketFormat;
  pngScale: number;
  mat: boolean;
  gifLong: number;
  /** GIF 的播放次數（0＝無限循環） */
  plays: number;
  /** SF 證件的名字產生器的設定（2026-11-05） */
  sfNames: { region: SfNameRegion; gender: SfNameGender };
  /** SF 證件的預設集（存在這台裝置，2026-11-05） */
  sfPresets: SfPreset[];
}

export const initialPrefs = (): Prefs => ({
  tab: 'content',
  side: 'front',
  lanyard: 'preview',
  sfScale: 1,
  idMode: 'card',
  idFaces: 'current',
  ticketFormat: 'png',
  pngScale: 2,
  mat: true,
  gifLong: 1400,
  plays: 0,
  sfNames: { region: 'any', gender: 'any' },
  sfPresets: [],
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data as Prefs & { strap?: unknown };
  const d = initialPrefs();
  const fixed: Prefs = {
    tab: p.tab === 'style' ? 'style' : 'content',
    side: p.side === 'back' ? 'back' : 'front',
    /* 以前的格式只有 strap（讀出來時 lanyard 是補上的預設值）：開＝只在預覽、關＝不要 */
    lanyard:
      typeof p.strap === 'boolean'
        ? p.strap
          ? 'preview'
          : 'none'
        : (LANYARD_MODES as readonly string[]).includes(p.lanyard)
          ? p.lanyard
          : d.lanyard,
    sfScale: (SF_SCALES as readonly number[]).includes(p.sfScale) ? p.sfScale : d.sfScale,
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
    sfNames: {
      region: isSfNameRegion(p.sfNames?.region) ? p.sfNames.region : 'any',
      gender: p.sfNames?.gender === 'm' || p.sfNames?.gender === 'f' ? p.sfNames.gender : 'any',
    },
    sfPresets: normalizePresets(p.sfPresets),
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

/** 裁切對話框：裝飾圖、執照的自訂圖示（新放的圖依序一張一張開） */
export interface CropRequest {
  target: { kind: 'element'; id: string } | { kind: 'license'; key: string };
  bitmap: ImageBitmap;
  /** 目前的裁切（原圖的比例） */
  crop: CropFrac;
  /** 新放的圖：取消＝整張圖、裁好的部分放在原本的位置 */
  fresh: boolean;
}

export const useUi = create<{
  frame: FrameRequest | null;
  crop: CropRequest | null;
  /** 選取的裝飾圖 */
  element: string | null;
  /** 正在改的執照（自訂名稱與圖示的對話框） */
  license: string | null;
  /** 新的裝飾圖放的位置（預覽畫的時候記下的這一款的「標誌位置」，卡片的比例） */
  spot: { x: number; y: number; size: number } | null;
  /** SF 證件的條碼／QR code 畫在哪（預覽畫的時候記下；算密度用） */
  sfCode: SfCodeBox | null;
}>(() => ({
  frame: null,
  crop: null,
  element: null,
  license: null,
  spot: null,
  sfCode: null,
}));

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄、存著的 SF 證件預設用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  const ids = referencedAssetIds(useDoc, stateAssetIds);
  for (const id of presetAssetIds(prefsNow().sfPresets)) ids.add(id);
  return ids;
}

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
  useUi.setState({ element: null });
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
  if (d.kind === 'sf') return sfBlank(d.sf.blank).fields;
  return d.kind === 'id'
    ? idTemplate(d.idTemplate).fields
    : ticketTemplate(d.ticketTemplate).fields;
}

/** 寫一個欄位的值（目前的類別） */
function writeValue(d: IdTicketState, key: string, v: string): void {
  if (d.kind === 'sf') d.sf.values[key] = v;
  else if (d.kind === 'id') d.idValues[key] = v;
  else d.ticketValues[d.ticketTemplate][key] = v;
}

export function fieldDef(key: string, d: IdTicketState = docNow()): FieldDef | undefined {
  return currentFields(d).find((f) => f.key === key);
}

/** 改目前範本的一個欄位 */
export function setValue(key: string, raw: string): void {
  const f = fieldDef(key);
  if (!f) return;
  const v = cleanValue(f, raw);
  edit((d) => writeValue(d, key, v));
}

export function fieldValue(key: string, d: IdTicketState = docNow()): string {
  if (d.kind === 'sf') return d.sf.values[key] ?? '';
  return d.kind === 'id'
    ? (d.idValues[key] ?? '')
    : (d.ticketValues[d.ticketTemplate]?.[key] ?? '');
}

/** 欄位有沒有「重新產生」 */
export const canGenerate = (f: FieldDef): boolean => !!(f.gen || f.genDate);

/** 產生一個新值（SF 證件：編號 5 種格式隨機挑、種別、日期） */
function generated(f: FieldDef, kind: Kind, rand: () => number): string | null {
  if (kind === 'sf') return sfGenerate(f, rand);
  return f.gen ? generateCode(f.gen, rand) : null;
}

/** 重新產生一個編號欄位（沒有格式的欄位不做事） */
export function regenerate(key: string, rand: () => number = Math.random): void {
  const f = fieldDef(key);
  if (!f || !canGenerate(f)) return;
  const v = generated(f, docNow().kind, rand);
  if (v !== null) setValue(key, v);
}

/** 重新產生目前範本所有的編號欄位（一步復原） */
export function regenerateAll(rand: () => number = Math.random): void {
  const fields = currentFields().filter(canGenerate);
  if (!fields.length) return;
  const kind = docNow().kind;
  edit((d) => {
    for (const f of fields) {
      const g = generated(f, kind, rand);
      if (g !== null) writeValue(d, f.key, cleanValue(f, g));
    }
  });
}

/** 清空目前範本的欄位（同原作的「全部清空」） */
export function clearFields(): void {
  const fields = currentFields();
  edit((d) => {
    for (const f of fields) writeValue(d, f.key, '');
  });
}

/** 目前範本的欄位填回範例 */
export function fillSample(): void {
  const d0 = docNow();
  const fields = currentFields(d0);
  edit((d) => {
    if (d.kind === 'sf') {
      const def = sfValueDefaults();
      for (const f of fields) d.sf.values[f.key] = def[f.key] ?? '';
      if (d.sf.blank === 'license') d.sf.licenses = [...SF_LICENSES_DEFAULT];
    } else if (d.kind === 'id')
      for (const f of fields) d.idValues[f.key] = ID_DEFAULTS[f.key] ?? '';
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
  if (d.kind === 'sf') {
    const { box } = sfPortrait(d.sf.blank, d.sf.style);
    return {
      aspect: box.w / box.h,
      circle: false,
      maxZoom: SF_ZOOM_MAX,
      box: { width: box.w, height: box.h },
    };
  }
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
  if (d.kind === 'sf') return d.sf.photo;
  return d.kind === 'id' ? d.idPhoto : (d.ticketPhotos[d.ticketTemplate] ?? null);
}

function writePhoto(d: IdTicketState, p: Photo | null): void {
  if (d.kind === 'sf') d.sf.photo = p;
  else if (d.kind === 'id') d.idPhoto = p;
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
    if (patch.price !== undefined) it.price = roundPrice(patch.price);
  });
}

/* ---------- 證件照片的效果 ---------- */

export function setIdPhotoFx(patch: Partial<PhotoFx>): void {
  edit((d) => {
    Object.assign(d.idPhotoFx, patch);
  });
}

/* ======================================================================
 * SF 證件
 * ==================================================================== */

export function setSfBlank(id: SfBlankId): void {
  useUi.setState({ element: null });
  if (docNow().sf.blank === id) return;
  edit((d) => {
    d.sf.blank = id;
  });
}

export function setSfStyle(patch: Partial<SfStyle>): void {
  edit((d) => {
    Object.assign(d.sf.style, patch);
  });
}

export function setSfPhotoFx(patch: Partial<PhotoFx>): void {
  edit((d) => {
    Object.assign(d.sf.style.photoFx, patch);
  });
}

/** 卡上印的欄位名稱 */
export function setSfCaption(key: string, raw: string): void {
  edit((d) => {
    d.sf.captions[key] = oneLine(raw, sfCaptionMax(key));
  });
}

export function resetSfCaption(key: string): void {
  edit((d) => {
    delete d.sf.captions[key];
  });
}

/* ---------- 執照 ---------- */

export function toggleLicense(key: string): void {
  edit((d) => {
    const on = d.sf.licenses.includes(key);
    d.sf.licenses = on ? d.sf.licenses.filter((k) => k !== key) : [...d.sf.licenses, key];
  });
}

export function setLicenseCap(key: string, raw: string): void {
  const v = oneLine(raw, LICENSE_CAP_MAX);
  edit((d) => {
    if (v.trim()) d.sf.licenseCaps[key] = v;
    else delete d.sf.licenseCaps[key];
  });
}

export function setLicenseIcon(
  key: string,
  image: SfState['licenseIcons'][string]['image'],
  crop: CropFrac,
): void {
  edit((d) => {
    d.sf.licenseIcons[key] = { image, crop: { ...crop } };
  });
}

export function setLicenseIconCrop(key: string, crop: CropFrac): void {
  edit((d) => {
    const ic = d.sf.licenseIcons[key];
    if (ic) ic.crop = { ...crop };
  });
}

/** 執照回到內建的圖示與名稱 */
export function resetLicense(key: string): void {
  edit((d) => {
    delete d.sf.licenseIcons[key];
    delete d.sf.licenseCaps[key];
  });
}

/* ---------- 浮水印 ---------- */

export function setWatermark(patch: Partial<SfWatermark>): void {
  edit((d) => {
    Object.assign(d.sf.watermark, patch);
  });
}

/* ---------- 證件的浮水印與裝飾圖（2026-11-05） ---------- */

export function setIdWatermark(patch: Partial<SfWatermark>): void {
  edit((d) => {
    Object.assign(d.idDecor.watermark, patch);
  });
}

export function setIdDecor(patch: Partial<Pick<IdDecor, 'side' | 'photoOverElements'>>): void {
  edit((d) => {
    Object.assign(d.idDecor, patch);
  });
}

/* ---------- 裝飾圖（SF 證件：每一款各自；證件：每一款的每一面各自） ---------- */

/** 目前的裝飾圖（SF 證件：這一款；證件：這一款顯示的那一面；票券沒有） */
export function currentElements(
  d: IdTicketState = docNow(),
  side: Side = prefsNow().side,
): SfElement[] {
  if (d.kind === 'sf') return d.sf.elements[d.sf.blank] ?? [];
  if (d.kind === 'id') return d.idDecor.elements[d.idTemplate]?.[side] ?? [];
  return [];
}

/** 改的時候用（edit 裡的草稿） */
function elementList(d: IdTicketState): SfElement[] {
  if (d.kind === 'sf') return d.sf.elements[d.sf.blank];
  if (d.kind === 'id') return d.idDecor.elements[d.idTemplate][prefsNow().side];
  return [];
}

function setElementList(d: IdTicketState, list: SfElement[]): void {
  if (d.kind === 'sf') d.sf.elements[d.sf.blank] = list;
  else if (d.kind === 'id') d.idDecor.elements[d.idTemplate][prefsNow().side] = list;
}

/** 裝飾圖的座標用的卡片大小（SF 證件：原生像素；證件：成品的設計單位） */
export function elementFrame(d: IdTicketState = docNow()): { w: number; h: number } {
  if (d.kind === 'sf') {
    const b = sfBlank(d.sf.blank);
    return { w: b.w, h: b.h };
  }
  return cardUnits(idTemplate(d.idTemplate).orientation);
}

/** 放一張新的裝飾圖：在這一款的「標誌位置」或卡片中央（同一個位置已經有的話錯開一點） */
export function addElement(
  image: SfElement['image'],
  spot: { x: number; y: number; size: number } | null,
): string | null {
  const d0 = docNow();
  if (d0.kind === 'ticket' || currentElements(d0).length >= SF_ELEMENT_MAX) return null;
  const id = newElementId();
  edit((d) => {
    const list = elementList(d);
    const el: SfElement = {
      id,
      image,
      x: spot?.x ?? 0.5,
      y: spot?.y ?? 0.5,
      size: Math.min(ELEMENT_SIZE_RANGE.max, Math.max(ELEMENT_SIZE_RANGE.min, spot?.size ?? 0.3)),
      alpha: 100,
      tint: true,
      thr: 0,
      crop: { ...WHOLE },
    };
    while (list.some((o) => Math.abs(o.x - el.x) < 1e-3 && Math.abs(o.y - el.y) < 1e-3)) {
      el.x = Math.min(1, el.x + 0.03);
      el.y = Math.min(1, el.y + 0.03);
    }
    list.push(el);
  });
  useUi.setState({ element: id });
  return id;
}

export function patchElement(id: string, patch: Partial<Omit<SfElement, 'id' | 'image'>>): void {
  edit((d) => {
    const el = elementList(d).find((x) => x.id === id);
    if (!el) return;
    Object.assign(el, patch);
    el.size = Math.min(ELEMENT_SIZE_RANGE.max, Math.max(ELEMENT_SIZE_RANGE.min, el.size));
    el.alpha = Math.round(Math.min(100, Math.max(0, el.alpha)));
    el.thr = Math.round(Math.min(100, Math.max(0, el.thr)));
    el.x = Math.min(1.5, Math.max(-0.5, el.x));
    el.y = Math.min(1.5, Math.max(-0.5, el.y));
  });
}

export function removeElement(id: string): void {
  if (useUi.getState().element === id) useUi.setState({ element: null });
  edit((d) => {
    setElementList(
      d,
      elementList(d).filter((x) => x.id !== id),
    );
  });
}

/** 上一層（dir 1）／下一層（−1） */
export function moveElement(id: string, dir: 1 | -1): void {
  edit((d) => {
    const list = elementList(d);
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
}

/* ---------- SF 證件：名字產生器（2026-11-05） ---------- */

/** 填入產生的名字：名、姓，活動證的稱謂（MR／MS）、公民 ID 的性別（M／F）；一步復原 */
export function applySfName(n: SfName): void {
  const d0 = docNow();
  const def = sfBlank(d0.sf.blank);
  const has = (key: string) => def.fields.find((f) => f.key === key);
  edit((d) => {
    const put = (key: string, v: string) => {
      const f = has(key);
      if (f) d.sf.values[key] = cleanValue(f, v);
    };
    put('given', n.given);
    put('surname', n.surname);
    if (d.sf.blank === 'event') put('title', n.gender === 'f' ? 'MS' : 'MR');
    if (d.sf.blank === 'citizen') put('sex', n.gender === 'f' ? 'F' : 'M');
  });
}

/** 這一款有名字的欄位（名、姓） */
export const sfHasNames = (d: IdTicketState = docNow()): boolean =>
  sfBlank(d.sf.blank).fields.some((f) => f.key === 'given');

/* ---------- SF 證件：預設集（2026-11-05） ---------- */

export const savedPresets = (): SfPreset[] => prefsNow().sfPresets;

/** 換掉整張 SF 證件（套用預設；一步復原） */
export function replaceSf(next: IdTicketState['sf']): void {
  useUi.setState({ element: null });
  edit((d) => {
    d.sf = structuredClone(next);
  });
}
