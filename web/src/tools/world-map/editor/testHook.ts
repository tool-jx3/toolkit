/**
 * 測試與對等驗證用的窗口：`window.__worldMap`（狀態、視角、匯出、產生）。
 */
import { renderPngCanvas } from '../draw/export';
import { generateTerrain, generateWorld, populateWorld } from '../model/generate';
import { fromOriginal, normalizeDoc } from '../model/normalize';
import { sampleDoc } from '../model/samples';
import * as act from './actions';
import { editor } from './controller';
import { docNow, useDoc, useEditor, usePrefs } from './store';

declare global {
  interface Window {
    __worldMap?: unknown;
  }
}

export function installTestHook(): void {
  window.__worldMap = {
    useDoc,
    useEditor,
    usePrefs,
    editor,
    act,
    sampleDoc,
    normalizeDoc,
    fromOriginal,
    generateTerrain,
    generateWorld,
    populateWorld,
    /** 地圖座標 → 頁面座標（點畫布用） */
    toClient: (x: number, y: number) => {
      const r = editor.canvas?.getBoundingClientRect();
      const p = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + p.x, y: (r?.top ?? 0) + p.y };
    },
    view: () => ({ ...editor.view }),
    /** 照目前的地圖畫一張 PNG（data URL） */
    exportPng: (width: number, audience: 'gm' | 'player') => {
      const c = renderPngCanvas(docNow(), width, audience);
      return { width: c.width, height: c.height, url: c.toDataURL('image/png') };
    },
  };
}
