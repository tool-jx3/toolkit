/**
 * 測試與對等驗證用的窗口：`window.__crossSection`（狀態、視角、匯出、範例、讀入）。
 */
import { renderPng } from '../draw/export';
import { layoutOf } from '../model/layout';
import { fromOriginal, normalizeDoc } from '../model/normalize';
import { addFloor, addShaft, mergeFloor, removeFloor, settle, splitFloor } from '../model/ops';
import { sampleDoc } from '../model/samples';
import * as act from './actions';
import { editor } from './controller';
import { docNow, useDoc, useEditor, usePrefs } from './store';

declare global {
  interface Window {
    __crossSection?: unknown;
  }
}

export function installTestHook(): void {
  window.__crossSection = {
    useDoc,
    useEditor,
    usePrefs,
    editor,
    act,
    sampleDoc,
    normalizeDoc,
    fromOriginal,
    /** 改結構的操作（直接改傳進來的資料；對等驗證用） */
    ops: { addFloor, addShaft, mergeFloor, removeFloor, settle, splitFloor },
    layout: () => layoutOf(docNow()),
    /** 建築的座標 → 頁面座標（點畫布用） */
    toClient: (x: number, y: number) => {
      const r = editor.canvas?.getBoundingClientRect();
      const p = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + p.x, y: (r?.top ?? 0) + p.y };
    },
    view: () => ({ ...editor.view }),
    exportPng: (e: Parameters<typeof renderPng>[1]) => {
      const c = renderPng(docNow(), e);
      return { width: c.width, height: c.height, url: c.toDataURL('image/png') };
    },
  };
}
