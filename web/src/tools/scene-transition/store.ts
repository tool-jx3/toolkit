/**
 * 狀態：全部設定（目前效果、外觀、形狀、時間、字幕、進階、輸出尺寸、每秒格數、格式、花紋編號）
 * 自動存在瀏覽器（localStorage `trpg-toolkit:scene-transition`），可復原／重做最多 150 步。
 * 每個「確定的變更」算一步：滑桿放開、選單選定、開關、色彩確定、文字欄離開焦點、換效果、換花紋。
 * 預覽背景、背景圖、復原紀錄不存（規格 F64）。
 */
import { createToolStore, historyGesture } from '@/core/storage';
import { applyEffect, DEFAULT_SETTINGS, nextSeed, normalizeSettings } from './model';
import { type Settings, TOOL_ID } from './settings';

export const useSt = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (persisted) => normalizeSettings(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 開頁時修正存檔（先套用該效果的初始設定，再蓋上存下的值；規格 F65、F66）；復原紀錄從空的開始 */
{
  const cur = useSt.getState().data;
  const fixed = normalizeSettings(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useSt.getState().replace(fixed);
  useSt.temporal.getState().clear();
}

/** 滑桿、文字欄、色彩欄的「放開才記一步」 */
export const gesture = historyGesture(useSt);

/* 換效果、復原、重做時預覽立即重算（其他變更等約 0.12 秒，規格 F47） */
let immediate = false;
export const takeImmediate = (): boolean => {
  const v = immediate;
  immediate = false;
  return v;
};

export function setValue<K extends keyof Settings>(key: K, value: Settings[K]): void {
  useSt.getState().update((d) => {
    (d as Settings)[key] = value;
  });
}

export function patch(p: Partial<Settings>): void {
  useSt.getState().patch(p);
}

/** 選取效果（規格 F01、F02、4.5） */
export function chooseEffect(id: string): void {
  immediate = true;
  useSt.getState().replace(applyEffect(useSt.getState().data, id));
}

/** 換花紋（規格 F21）：1～9999 之間、與目前不同的隨機整數 */
export function reseed(): void {
  setValue('seed', nextSeed(useSt.getState().data.seed));
}

export function undo(): void {
  if (!useSt.temporal.getState().pastStates.length) return;
  immediate = true;
  useSt.temporal.getState().undo();
}

export function redo(): void {
  if (!useSt.temporal.getState().futureStates.length) return;
  immediate = true;
  useSt.temporal.getState().redo();
}
