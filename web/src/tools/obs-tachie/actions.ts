/**
 * 改資料的動作（都經過 useTachie，所以可以復原）。
 */
import type { Draft } from 'immer';
import { historyGesture } from '@/core/storage';
import {
  addUser as addUserTo,
  createPreset,
  type Preset,
  removePreset as removePresetFrom,
  removeUser as removeUserFrom,
  resetPresetOptions,
  saveCombo as saveComboIn,
  type TachieData,
} from './model';
import { useTachie, useView } from './store';

const set = (fn: (d: TachieData) => TachieData) =>
  useTachie.getState().replace(fn(useTachie.getState().data));

export const gesture = historyGesture(useTachie);

/**
 * 連續的變更（拖曳調色盤）合併成一步：第一次變更開始手勢，停下 500 ms 後才記成一步。
 */
let idleTimer: ReturnType<typeof setTimeout> | null = null;
export function liveIdle<A extends unknown[]>(fn: (...args: A) => void) {
  return (...args: A): void => {
    useTachie.beginGesture();
    fn(...args);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      useTachie.endGesture();
    }, 500);
  };
}

export function addUser(input: { id: string; memo: string; name: string }) {
  const r = addUserTo(useTachie.getState().data, input);
  if (!r.error) useTachie.getState().replace(r.data);
  return r;
}

export const removeUser = (id: string) => set((d) => removeUserFrom(d, id));

export function setUserName(id: string, name: string) {
  useTachie.getState().update((d) => {
    const u = d.users.find((x) => x.id === id);
    if (u) u.name = name;
  });
}

export function addPreset(): string {
  const p = createPreset();
  useTachie.getState().update((d) => {
    d.presets.push(p);
  });
  useView.getState().patch({ editingId: p.id });
  return p.id;
}

export function removePreset(id: string) {
  set((d) => removePresetFrom(d, id));
}

/** 改一個預設集（Immer 寫法） */
export function updatePreset(id: string, recipe: (p: Draft<Preset>) => void) {
  useTachie.getState().update((d) => {
    const p = d.presets.find((x) => x.id === id);
    if (p) recipe(p);
  });
}

export function resetOptions(id: string) {
  useTachie.getState().update((d) => {
    const i = d.presets.findIndex((x) => x.id === id);
    if (i >= 0) d.presets[i] = resetPresetOptions(d.presets[i] as Preset);
  });
}

export function setCurrent(patch: Partial<TachieData['current']>) {
  useTachie.getState().update((d) => {
    Object.assign(d.current, patch);
  });
}

export const saveCombo = () => set(saveComboIn);

export function removeCombo(userId: string, presetId: string) {
  useTachie.getState().update((d) => {
    d.saved = d.saved.filter((s) => !(s.userId === userId && s.presetId === presetId));
  });
}
