/**
 * 角色卡的操作（清單、目前的角色卡、技能列、武器、頭像）。修改都經過 useSheets（自動存檔、復原／重做）；
 * 切換目前的角色卡、分頁只改 useView（不列入復原）。
 */
import type { Draft } from 'immer';
import type { Rect } from '@/core/image';
import {
  currentSheet,
  duplicateSheet,
  newSheet,
  newSkill,
  newWeapon,
  type Sheet,
  type Skill,
} from './model';
import { assets, useSheets, useView } from './store';

export const currentId = (): string =>
  currentSheet(useSheets.getState().data, useView.getState().data.currentId).id;

export function selectSheet(id: string): void {
  useView.getState().patch({ currentId: id });
}

/** 修改目前的角色卡 */
export function updateSheet(recipe: (s: Draft<Sheet>) => void, id: string = currentId()): void {
  useSheets.getState().update((d) => {
    const s = d.sheets.find((x) => x.id === id);
    if (s) recipe(s);
  });
}

export function addSheet(): void {
  const s = newSheet();
  useSheets.getState().update((d) => {
    d.sheets.push(s);
  });
  selectSheet(s.id);
}

export function copySheet(id: string): void {
  const src = useSheets.getState().data.sheets.find((s) => s.id === id);
  if (!src) return;
  const copy = duplicateSheet(src);
  useSheets.getState().update((d) => {
    const i = d.sheets.findIndex((s) => s.id === id);
    d.sheets.splice(i + 1, 0, copy);
  });
  selectSheet(copy.id);
}

export function renameSheet(id: string, title: string): void {
  updateSheet((s) => {
    s.title = title;
  }, id);
}

/** 刪除一張（至少留一張）；刪掉目前的角色卡時切到前一張（沒有前一張時下一張） */
export function removeSheet(id: string): void {
  const list = useSheets.getState().data.sheets;
  if (list.length <= 1) return;
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return;
  const wasCurrent = currentId() === id;
  useSheets.getState().update((d) => {
    d.sheets.splice(i, 1);
  });
  if (wasCurrent) {
    const next = useSheets.getState().data.sheets[Math.max(0, i - 1)];
    selectSheet(next.id);
  }
}

/* ---------- 技能列 ---------- */

export function updateSkill(skillId: string, recipe: (s: Draft<Skill>) => void): void {
  updateSheet((s) => {
    const k = s.skills.find((x) => x.id === skillId);
    if (k) recipe(k);
  });
}

/** 在某一列下面插入空白列（沒有指定時加在最後）；回傳新列的 id */
export function insertSkill(afterId?: string): string {
  const row = newSkill();
  updateSheet((s) => {
    const i = afterId ? s.skills.findIndex((x) => x.id === afterId) : -1;
    if (i < 0) s.skills.push(row);
    else s.skills.splice(i + 1, 0, row);
  });
  return row.id;
}

export function removeSkill(skillId: string): void {
  updateSheet((s) => {
    s.skills = s.skills.filter((x) => x.id !== skillId);
    for (const w of s.weapons) if (w.skillId === skillId) w.skillId = null;
  });
}

export function moveSkill(from: number, to: number): void {
  updateSheet((s) => {
    if (from === to || from < 0 || to < 0 || from >= s.skills.length || to >= s.skills.length)
      return;
    const [row] = s.skills.splice(from, 1);
    s.skills.splice(to, 0, row);
  });
}

/* ---------- 武器 ---------- */

export function addWeapon(): string {
  const w = newWeapon();
  updateSheet((s) => {
    s.weapons.push(w);
  });
  return w.id;
}

export function removeWeapon(id: string): void {
  updateSheet((s) => {
    s.weapons = s.weapons.filter((w) => w.id !== id);
  });
}

export function moveWeapon(id: string, dir: -1 | 1): void {
  updateSheet((s) => {
    const i = s.weapons.findIndex((w) => w.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.weapons.length) return;
    const [w] = s.weapons.splice(i, 1);
    s.weapons.splice(j, 0, w);
  });
}

/* ---------- 頭像 ---------- */

/** 放進資產庫並設成目前角色卡的頭像；回傳是否存進了瀏覽器 */
export async function setPortrait(
  blob: Blob,
  crop: Rect,
  id: string = currentId(),
): Promise<{ persisted: boolean; reason?: string }> {
  const r = await assets.add(blob);
  updateSheet((s) => {
    s.portrait = { assetId: r.id, crop };
  }, id);
  return { persisted: r.persisted, reason: r.reason };
}

export function setPortraitCrop(crop: Rect): void {
  updateSheet((s) => {
    if (s.portrait) s.portrait.crop = crop;
  });
}

export function removePortrait(): void {
  updateSheet((s) => {
    s.portrait = null;
  });
}
