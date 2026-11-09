/**
 * 測試與對等驗證用的窗口：`window.__floorPlan`（狀態、視角、匯出）。
 */
import { exportLayout, renderImage } from '../draw/export';
import { stackImageLayout } from '../draw/stack';
import { isAsset } from '../model/assets';
import {
  type ExportSettings,
  exportFloors,
  exportJobs,
  exportOptions,
  stackExportOptions,
} from '../model/exportPlan';
import { floorBounds, sizeText, visibleFloor } from '../model/geometry';
import { normalizeProject } from '../model/normalize';
import { encodeMapHash, type ShareMode } from '../model/share';
import { plateRect, stackProject, verticalLinks } from '../model/stack';
import { computeWalls } from '../model/walls';
import { instantiateTemplate } from '../templates';
import * as act from './actions';
import { editor } from './controller';
import { loadStage, type StageModule, stageModule, useStage } from './stageStore';
import { useEditor, usePrefs, useProject } from './store';

declare global {
  interface Window {
    __floorPlan?: unknown;
  }
}

/** 演出的程式載入好之後才有的窗口（stageAct、stageTimeline；D131） */
function stageHooks(m: StageModule) {
  return {
    stageAct: m.stageAct,
    stageTimeline: () => {
      const tl = m.timelineOf(useProject.getState().data);
      return {
        total: tl.total,
        playable: tl.playable,
        manual: tl.manual,
        steps: tl.steps.map((s) => ({
          kind: s.kind,
          floor: s.floor,
          start: s.start,
          duration: s.duration,
          bridge: s.bridge,
          revealRooms: s.revealRooms,
          revealFloors: s.revealFloors,
          hidden: [...s.hidden],
        })),
      };
    },
  };
}

export function installTestHook(): void {
  const loadedNow = stageModule();
  const hook: Record<string, unknown> = {
    useProject,
    usePrefs,
    useEditor,
    /** 演出（2026-11-09）：畫面狀態；`loadStage()` 載入演出的程式之後才有 stageAct、stageTimeline（打開演出時也會載入） */
    useStage,
    loadStage: async () => {
      Object.assign(hook, stageHooks(await loadStage()));
    },
    ...(loadedNow ? stageHooks(loadedNow) : {}),
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
    /** 目前地圖的分享連結的 # 部分（F215） */
    shareHash: (mode: ShareMode) => encodeMapHash(useProject.getState().data, mode).hash,
    /** 世界座標 → 頁面座標（點畫布用） */
    toClient: (x: number, y: number) => {
      const r = editor.canvas?.getBoundingClientRect();
      const p = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + p.x, y: (r?.top ?? 0) + p.y };
    },
    view: () => ({ ...editor.view }),
    /**
     * 立體樓層圖、樓層總覽（2026-11-09）：平面上的 (x, y) 在立體圖第 level 層的頁面座標；樓層牌、總覽卡片的中心；上下樓層的連接
     */
    stackClient: (x: number, y: number, level: number) => {
      const s = editor.scene3d();
      let p = stackProject(s.stack, x, y, level);
      if (s.board)
        p = {
          ...p,
          x: s.board.stackTx + p.x * s.board.stackScale,
          y: s.board.stackTy + p.y * s.board.stackScale,
        };
      const r = editor.canvas?.getBoundingClientRect();
      const q = editor.toScreen(p.x, p.y);
      return { x: (r?.left ?? 0) + q.x, y: (r?.top ?? 0) + q.y };
    },
    plateClient: (level: number) => {
      const s = editor.scene3d();
      const b = plateRect(s.stack, level);
      let x = b.x + b.w / 2;
      let y = b.y + b.h / 2;
      if (s.board) {
        x = s.board.stackTx + x * s.board.stackScale;
        y = s.board.stackTy + y * s.board.stackScale;
      }
      const r = editor.canvas?.getBoundingClientRect();
      const q = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + q.x, y: (r?.top ?? 0) + q.y };
    },
    cardClient: (level: number) => {
      const card = editor.scene3d().board?.cards.find((c) => c.level === level);
      if (!card) return null;
      const r = editor.canvas?.getBoundingClientRect();
      const q = editor.toScreen(card.x + card.w / 2, card.y + card.h / 2);
      return { x: (r?.left ?? 0) + q.x, y: (r?.top ?? 0) + q.y };
    },
    /** 立體樓層圖、樓層總覽的匯出尺寸（目前的地圖與匯出設定，換範圍與每格 px） */
    stackExportSize: (range: 'stack' | 'board', px: number) => {
      const p = useProject.getState().data;
      const exp: ExportSettings = { ...usePrefs.getState().data.exp, range };
      const L = stackImageLayout(exportFloors(p, range), stackExportOptions(p, exp, p.theme, px));
      return { width: L.pxWidth, height: L.pxHeight };
    },
    stackLinks: () => {
      const s = editor.scene3d();
      return verticalLinks(s.floors).map((l) => ({ level: l.level, kind: l.kind }));
    },
    /** 照匯出對話框目前的設定畫出第一張圖（data URL 與尺寸） */
    exportPng: () => {
      const p = useProject.getState().data;
      const exp = usePrefs.getState().data.exp;
      const [job] = exportJobs(p, exp);
      const c = renderImage(job.floors, exportOptions(p, exp, p.theme, exp.px));
      return { name: job.name, width: c.width, height: c.height, url: c.toDataURL('image/png') };
    },
  };
  window.__floorPlan = hook;
  /* 按「演出」載入之後也補上 */
  useStage.subscribe((st, prev) => {
    const m = stageModule();
    if (st.ready && !prev.ready && m) Object.assign(hook, stageHooks(m));
  });
}
