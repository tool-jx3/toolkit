/**
 * 設定與名單的動作（每個動作＝一步復原）。遊戲進行中設定鎖住：這裡的動作一律不做事（畫面上的控制項也停用）。
 */
import type { CropTarget } from './CropEditor';
import { storePhoto, storeThumb } from './images';
import {
  type Crop,
  createCharacter,
  DEFAULT_CROP,
  DEFAULT_OVERLAY,
  demoCharacters,
  MAX_POOL,
  nameFromFile,
  PHOTO_MAX_SIDE,
  PORTRAIT_MAX_SIDE,
  type RankCharacter,
} from './model';
import { configNow, edit, isLocked, useSession } from './store';
import { S } from './strings';

/** 換一個設定（鎖住時不做事） */
export function set(recipe: Parameters<typeof edit>[0]): void {
  if (isLocked()) return;
  edit(recipe);
}

/** 加名字（「新增名字」與「一次輸入名字」）；超過上限時回傳 false、不加 */
export function addNames(names: string[]): boolean {
  if (isLocked()) return false;
  if (configNow().characters.length + names.length > MAX_POOL) return false;
  edit((d) => {
    for (const n of names) d.characters.push(createCharacter(n));
  });
  return true;
}

/** 「新增名字」：「角色 N」；回傳新角色的 id（滿了時 null） */
export function addBlank(): string | null {
  const n = configNow().characters.length;
  if (n >= MAX_POOL) return null;
  const ch = createCharacter(S.defaultName(n + 1));
  if (isLocked()) return null;
  edit((d) => {
    d.characters.push(ch);
  });
  return ch.id;
}

export interface AddPhotosResult {
  added: number;
  errors: string[];
  notPersisted: boolean;
}

/** 一次加很多張照片（檔名當名稱、裁切置中）；全部處理完才一起放進名單（一步復原） */
export async function addPhotos(files: readonly File[]): Promise<AddPhotosResult> {
  const out: AddPhotosResult = { added: 0, errors: [], notPersisted: false };
  if (isLocked() || !files.length) return out;
  const list: RankCharacter[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      useSession.setState({ busy: `${i + 1} / ${files.length}` });
      try {
        const p = await storePhoto(f, PHOTO_MAX_SIDE);
        const t = await storeThumb(p.bitmap, p.ref, DEFAULT_CROP);
        if (!p.persisted || !t.persisted) out.notPersisted = true;
        const ch = createCharacter(nameFromFile(f.name, S.fallbackName));
        ch.photo = p.ref;
        ch.thumb = t.id;
        list.push(ch);
      } catch (e) {
        out.errors.push(e instanceof Error && e.message ? e.message : S.decodeError(f.name));
      }
    }
  } finally {
    useSession.setState({ busy: null });
  }
  if (list.length && !isLocked())
    edit((d) => {
      d.characters.push(...list);
    });
  out.added = list.length;
  return out;
}

export function renameCharacter(id: string, name: string): void {
  set((d) => {
    const ch = d.characters.find((c) => c.id === id);
    if (ch) ch.name = name;
  });
}

export function removeCharacter(id: string): void {
  set((d) => {
    d.characters = d.characters.filter((c) => c.id !== id);
  });
}

export function reorderCharacter(from: number, to: number): void {
  set((d) => {
    const [ch] = d.characters.splice(from, 1);
    if (ch) d.characters.splice(to, 0, ch);
  });
}

export const clearPool = () =>
  set((d) => {
    d.characters = [];
  });

export const loadDemo = () =>
  set((d) => {
    d.characters = demoCharacters();
  });

/** 套用裁切（新照片或重新裁切）：做 512 × 512 的裁切圖、記下原圖與裁切 */
export async function applyCrop(t: CropTarget, crop: Crop): Promise<boolean> {
  if (isLocked()) return true;
  const thumb = await storeThumb(t.bitmap, t.photo, crop);
  set((d) => {
    const ch = d.characters.find((c) => c.id === t.charId);
    if (!ch) return;
    ch.photo = { ...t.photo };
    ch.crop = { ...crop };
    ch.thumb = thumb.id;
  });
  return thumb.persisted;
}

export function removePhoto(id: string): void {
  set((d) => {
    const ch = d.characters.find((c) => c.id === id);
    if (!ch) return;
    ch.photo = null;
    ch.thumb = null;
    ch.crop = { ...DEFAULT_CROP };
  });
}

/** 放排名者的照片：填滿、放大 1、置中，並進入擺放模式 */
export async function setPortrait(file: File): Promise<{ persisted: boolean }> {
  const p = await storePhoto(file, PORTRAIT_MAX_SIDE);
  if (isLocked()) return { persisted: p.persisted };
  edit((d) => {
    d.portrait = { photo: p.ref, fit: 'cover', zoom: 1, x: 0, y: 0 };
  });
  useSession.setState({ placing: true });
  return { persisted: p.persisted };
}

export function removePortrait(): void {
  set((d) => {
    d.portrait = { photo: null, fit: 'cover', zoom: 1, x: 0, y: 0 };
  });
  useSession.setState({ placing: false });
}

/** 重設擺放：卡片回到預設的位置與大小、照片放大 1 並置中（擺法不變） */
export function resetPlacement(): void {
  set((d) => {
    d.overlay = { ...DEFAULT_OVERLAY };
    d.portrait.zoom = 1;
    d.portrait.x = 0;
    d.portrait.y = 0;
  });
}
