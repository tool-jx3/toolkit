/**
 * 測試與對等驗證用的窗口：`window.__floorPlan`（狀態、視角、匯出）。
 */
import { exportLayout, renderImage } from '../draw/export';
import { isAsset } from '../model/assets';
import { exportJobs, exportOptions } from '../model/exportPlan';
import { floorBounds, sizeText, visibleFloor } from '../model/geometry';
import { normalizeProject } from '../model/normalize';
import { computeWalls } from '../model/walls';
import { instantiateTemplate } from '../templates';
import * as act from './actions';
import { editor } from './controller';
import { useEditor, usePrefs, useProject } from './store';

declare global {
  interface Window {
    __floorPlan?: unknown;
  }
}

export function installTestHook(): void {
  window.__floorPlan = {
    useProject,
    usePrefs,
    useEditor,
    editor,
    act,
    computeWalls,
    instantiateTemplate,
    /** 對等驗證用：和原作同樣的資料比對牆、PL 檢視、範圍、面積、匯出尺寸 */
    parity: {
      normalize: (raw: unknown) => normalizeProject(raw, isAsset),
      visibleFloor,
      floorBounds,
      sizeText,
      exportLayout,
    },
    /** 世界座標 → 頁面座標（點畫布用） */
    toClient: (x: number, y: number) => {
      const r = editor.canvas?.getBoundingClientRect();
      const p = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + p.x, y: (r?.top ?? 0) + p.y };
    },
    view: () => ({ ...editor.view }),
    /** 照匯出對話框目前的設定畫出第一張圖（data URL 與尺寸） */
    exportPng: () => {
      const p = useProject.getState().data;
      const exp = usePrefs.getState().data.exp;
      const [job] = exportJobs(p, exp);
      const c = renderImage(job.floors, exportOptions(p, exp, p.theme, exp.px));
      return { name: job.name, width: c.width, height: c.height, url: c.toDataURL('image/png') };
    },
  };
}
