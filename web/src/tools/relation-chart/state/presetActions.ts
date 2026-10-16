/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 設定集的動作（F174；原作的 gsApplyValues、gsNextUnnamedName、整體設定庫的改名／最愛／刪除／排序）。全部進復原。
 */
import type { Draft } from 'immer';
import { sheetCtx } from '../engine/geom';
import { applyLayout } from '../logic/layout';
import { factoryPreset, readPreset } from '../model/normalize';
import { nextPresetName, sortedPresets } from '../model/presets';
import type { Project, SettingsPreset, Sheet, SheetSettings } from '../model/types';
import { S } from '../strings';
import { reorderIn } from './libActions';
import { projectNow, setUi, updateProject } from './store';

type DProject = Draft<Project>;
const cur = (p: DProject) => p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];

/**
 * 把一組值寫進目前分頁（之後不連動）；「角色之間的間距」變了就依目前的陣型重排（原作）。
 * 恢復出廠預設也照這個規則（原作那條路不重排，不一致；D 項）。
 */
function applyValues(p: DProject, values: Partial<SheetSettings>): void {
  const s = cur(p);
  const relayout =
    values.spacingPct !== undefined &&
    Math.round(values.spacingPct) !== Math.round(s.settings.spacingPct);
  for (const [k, v] of Object.entries(values))
    (s.settings as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
  if (relayout) applyLayout(sheetCtx(s as Sheet, projectNow().labels), s.settings.lastLayout);
}

/** 把目前分頁的設定存成新的一筆（「未命名設定集 N」），並在左欄選取它 */
export function savePreset(): number {
  let id = 0;
  updateProject((p) => {
    id = p.nextId++;
    p.settingsLib.push({
      id,
      name: nextPresetName(p.settingsLib as SettingsPreset[], S.gsets.unnamed),
      fav: false,
      values: readPreset(cur(p).settings as SheetSettings),
    });
  });
  setUi({ libPreset: id });
  return id;
}

export function overwritePreset(id: number): void {
  updateProject((p) => {
    const g = p.settingsLib.find((x) => x.id === id);
    if (g) g.values = readPreset(cur(p).settings as SheetSettings);
  });
}

export function applyPreset(id: number): void {
  updateProject((p) => {
    const g = p.settingsLib.find((x) => x.id === id);
    if (g) applyValues(p, g.values as Partial<SheetSettings>);
  });
}

/** 目前分頁恢復出廠預設＝新分頁的預設（7.4 第 13 項） */
export function factoryReset(): void {
  updateProject((p) => applyValues(p, factoryPreset()));
}

export function renamePreset(id: number, name: string): void {
  updateProject((p) => {
    const g = p.settingsLib.find((x) => x.id === id);
    if (g) g.name = name.trim().slice(0, 100);
  });
}

export function toggleFavPreset(id: number): void {
  updateProject((p) => {
    const g = p.settingsLib.find((x) => x.id === id);
    if (g) g.fav = !g.fav;
  });
}

/** 刪除（最愛的不能刪：回傳 false） */
export function deletePreset(id: number): boolean {
  const g = projectNow().settingsLib.find((x) => x.id === id);
  if (!g || g.fav) return false;
  updateProject((p) => {
    p.settingsLib = p.settingsLib.filter((x) => x.id !== id);
  });
  return true;
}

/** 拖曳排序（畫面上的順序＝最愛在前；換完照畫面上的順序存；搜尋中只換搜到的那幾格） */
export function reorderPresets(groupIds: readonly number[], from: number, to: number): void {
  updateProject((p) => {
    p.settingsLib = reorderIn(sortedPresets(p.settingsLib as SettingsPreset[]), groupIds, from, to);
  });
}
