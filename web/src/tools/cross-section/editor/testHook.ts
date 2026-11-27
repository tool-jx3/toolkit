/**
 * 測試與對等驗證用的窗口：`window.__crossSection`（狀態、視角、匯出、範例、讀入）。
 */
import { renderPng } from '../draw/export';
import { planOf, worldOf } from '../draw/scene';
import { blankTrainDoc } from '../model/factory';
import { layoutOf } from '../model/layout';
import { fromOriginal, normalizeDoc } from '../model/normalize';
import { addFloor, addShaft, mergeFloor, removeFloor, settle, splitFloor } from '../model/ops';
import { sampleDoc } from '../model/samples';
import type { Audience, EnvId } from '../model/types';
import {
  boardOf,
  cutinsOf,
  DEFAULT_ZIP,
  panelsOf,
  scenesOf,
  type ZipOptions,
  zipDoc,
} from '../zip/plan';
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
    blankTrainDoc,
    normalizeDoc,
    fromOriginal,
    /** 改結構的操作（直接改傳進來的資料；對等驗證用） */
    ops: { addFloor, addShaft, mergeFloor, removeFloor, settle, splitFloor },
    layout: () => layoutOf(docNow()),
    /** 列車的幾何（橫向車廂時；縱向時 null） */
    trainLayout: () => {
      const p = planOf(docNow());
      return p.kind === 'train' ? p.T : null;
    },
    /** 建築的座標 → 頁面座標（點畫布用） */
    toClient: (x: number, y: number) => {
      const r = editor.canvas?.getBoundingClientRect();
      const p = editor.toScreen(x, y);
      return { x: (r?.left ?? 0) + p.x, y: (r?.top ?? 0) + p.y };
    },
    view: () => ({ ...editor.view }),
    /** 房間 ZIP 的場景畫布（盤面大小；對等驗證、偽裝的逐像素比對用） */
    zipBoard: async (
      env: EnvId,
      flood: boolean,
      audience: Audience,
      o: Partial<ZipOptions> = {},
    ) => {
      const z = { ...DEFAULT_ZIP, ...o };
      const images = await import('../zip/images');
      const doc = zipDoc(docNow(), z.arrange);
      const plan = planOf(doc);
      const b = boardOf(worldOf(plan), z.token);
      const c = images.boardCanvas(doc, plan, b, env, flood, audience);
      return { width: c.width, height: c.height, url: c.toDataURL('image/png'), board: b };
    },
    /** 房間 ZIP 的構成（面板、場景、切入；純函式） */
    zipPlan: (o: Partial<ZipOptions> = {}) => {
      const z = { ...DEFAULT_ZIP, ...o };
      const plan = planOf(zipDoc(docNow(), z.arrange));
      return {
        board: boardOf(worldOf(plan), z.token),
        panels: panelsOf(plan, z),
        scenes: scenesOf(z),
        cutins: cutinsOf(z),
      };
    },
    exportPng: (e: Parameters<typeof renderPng>[1]) => {
      const c = renderPng(docNow(), e);
      return { width: c.width, height: c.height, url: c.toDataURL('image/png') };
    },
  };
}
