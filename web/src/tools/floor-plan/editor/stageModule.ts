/**
 * 演出的程式（2026-11-09，F313～F328；D131）：第一次按「演出」時才載入（stageStore.ts 的 `loadStage`）。
 * 面板、時間軸、匯出的對話框、畫布（StageCanvas）、操作、時間軸的計算都在這一包；路線的計算（model/route.ts）、
 * 演出的計算與畫法（model/stage.ts、draw/stage.ts）、文字（stageStrings.ts）跟著進來。
 */
import { editor } from './controller';
import { StageCanvas } from './stageCanvas';

export { StageDock } from './StageDock';
export { StageExportDialog } from './StageExport';
export { StagePanel, StageRooms, StageToolStrip } from './StagePanel';
export * as stageAct from './stageActions';
export { timelineOf } from './stageCache';

let installed = false;

/** 把演出的畫布接到編輯畫布上（只做一次） */
export function install(): void {
  if (installed) return;
  installed = true;
  editor.attachStage(new StageCanvas(editor));
}
