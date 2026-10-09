/**
 * 編輯中的引擎與存檔（同一時間只有一張地圖開著）。快捷鍵、面板從這裡拿；React 元件用 useRuntime() 在換地圖時重畫。
 */
import { create } from 'zustand';
import type { MapEngine } from './engine/engine';
import type { MapSession } from './session';

interface Runtime {
  engine: MapEngine | null;
  session: MapSession | null;
}

export const useRuntime = create<Runtime>(() => ({ engine: null, session: null }));

export function getEngine(): MapEngine | null {
  return useRuntime.getState().engine;
}

export function getSession(): MapSession | null {
  return useRuntime.getState().session;
}

export function setRuntime(patch: Partial<Runtime>): void {
  useRuntime.setState(patch);
}
