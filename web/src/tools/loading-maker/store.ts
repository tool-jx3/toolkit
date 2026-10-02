/**
 * 設定的 store（自動存檔＋復原）與預覽狀態（不列入復原：預覽速度、背景、選取的元素）。
 */
import type { Draft } from 'immer';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { ElementId } from './geometry';
import { TOOL_ID } from './media';
import { DEFAULT_SETTINGS, type LmSettings, normalizeSettings, settle } from './settings';

export const useLm = createToolStore<LmSettings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (persisted) => normalizeSettings(persisted) ?? DEFAULT_SETTINGS,
});

/** 修改設定（之後自動套用連動規則） */
export function edit(recipe: (d: Draft<LmSettings>) => void): void {
  useLm.getState().update((d) => {
    recipe(d);
    settle(d as LmSettings);
  });
}

export const settingsNow = (): LmSettings => useLm.getState().data;

export interface LmPreview {
  rate: number;
  selected: ElementId | null;
}

export const usePreview = createPreviewStore<LmPreview>(TOOL_ID, { rate: 1, selected: null });
