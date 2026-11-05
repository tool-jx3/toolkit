/**
 * 測試與對等驗證用的窗口：`window.__tileMap`（地圖、編輯狀態、圖庫、偏好、視角）。
 */
import * as act from './actions';
import { cellToClient, fitView, zoomTo } from './MapCanvas';
import { useEditor, useLibrary, useMap, usePrefs } from './store';

declare global {
  interface Window {
    __tileMap?: unknown;
  }
}

export function installTestHook(): void {
  window.__tileMap = {
    useMap,
    useEditor,
    useLibrary,
    usePrefs,
    act,
    fitView,
    zoomTo,
    cellToClient,
  };
}
