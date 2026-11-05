/**
 * 室內平面圖：版本 8 的地圖裡「甲板類疊在戶外房間上」（海面上的甲板、甲板上的甲板、庭院上的露台、道路上的屋頂平台）
 * 匯出的圖和改版前（第二批之前，main `d5026ac`）逐指令相同（主控 2026-11-05 裁定 D102：舊的地圖沒有 `deck`，照以前的規則）。
 * 存了再開（normalize 兩次）也一樣。基準值用 main 的程式跑這個檔產生（`PRINT_GOLDEN=1` 時印出來）。
 */
import { describe, expect, it } from 'vitest';
import { renderImage } from '@/tools/floor-plan/draw/export';
import { isAsset } from '@/tools/floor-plan/model/assets';
import {
  type ExportSettings,
  exportFloors,
  exportOptions,
} from '@/tools/floor-plan/model/exportPlan';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import type { Project, ThemeId } from '@/tools/floor-plan/model/types';
import fixture from '../fixtures/floor-plan-v8-stacked-decks.json';
import { installRecordingDocument, type RecordingCanvas } from '../helpers/recordingCanvas';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;

const EXP: ExportSettings = {
  range: 'current',
  view: 'pl',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
  mode: 'image',
  vttPx: 100,
  noise: true,
};

/** main `d5026ac` 的程式產生的雜湊（2026-11-05） */
const GOLDEN: Record<string, string> = {
  'clean|pl': '1056x1008:f0bf54e43a9095a2',
  'clean|gm': '1056x1056:51ea9fa520a4e5df',
  'blueprint|pl': '1056x1008:ec37fa2c1f1b92d9',
  'noir|transparent': '1056x1008:daab8033b8fc820c',
  'paper|grid|48': '2112x2016:86ef6a3a6e7db062',
};

function hashes(p: Project): Record<string, string> {
  const out: Record<string, string> = {};
  const cases: [string, ExportSettings, ThemeId][] = [
    ['clean|pl', EXP, 'clean'],
    ['clean|gm', { ...EXP, view: 'gm' }, 'clean'],
    ['blueprint|pl', EXP, 'blueprint'],
    ['noir|transparent', { ...EXP, transparent: true, noise: false }, 'noir'],
    ['paper|grid|48', { ...EXP, grid: true, px: 48 }, 'paper'],
  ];
  for (const [k, exp, theme] of cases) {
    const q = { ...p, theme };
    const c = renderImage(
      exportFloors(q, exp.range),
      exportOptions(q, exp, theme, exp.px),
    ) as unknown as RecordingCanvas;
    out[k] = `${c.width}x${c.height}:${c.hash}`;
  }
  return out;
}

describe('版本 8 的地圖：甲板疊在戶外房間上，匯出和改版前相同（D102）', () => {
  it('同一張地圖加上「甲板的外圍」（新畫的甲板）時疊放的邊才變成欄杆與段差線（圖不同）', () => {
    const r = installRecordingDocument();
    try {
      const p = normalizeProject(fixture.data, isAsset) as Project;
      for (const room of p.floors[0].rooms)
        if (['deck', 'fore', 'terrace', 'roof', 'pier'].includes(room.id)) room.deck = true;
      const h = hashes(p);
      for (const k of Object.keys(GOLDEN)) expect(h[k], k).not.toBe(GOLDEN[k]);
    } finally {
      r();
    }
  });

  it('讀進來、存了再開都和改版前逐指令相同；沒有多出 deck 欄位', () => {
    const r = installRecordingDocument();
    try {
      const p = normalizeProject(fixture.data, isAsset) as Project;
      const again = normalizeProject(JSON.parse(JSON.stringify(p)), isAsset) as Project;
      for (const room of again.floors[0].rooms) expect('deck' in room, room.id).toBe(false);
      const h = hashes(p);
      if (env?.PRINT_GOLDEN) console.info(JSON.stringify(h, null, 2));
      expect(h).toEqual(GOLDEN);
      expect(hashes(again)).toEqual(GOLDEN);
    } finally {
      r();
    }
  });
});
