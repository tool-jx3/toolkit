/**
 * 工具列、快捷鍵、動作列共用的操作（引擎從 runtime 拿）。
 */
import { pickFiles, readAsDataUrl } from '@/core/files';
import {
  bringSelectedToFront,
  deleteSelected,
  duplicateSelected,
  groupSelected,
  nudgeSelected,
  rotateSelected,
  selected,
  sendSelectedToBack,
  toggleLockSelected,
  toggleVisibilitySelected,
  ungroupSelected,
} from './engine/ops';
import { nextRotateStop } from './geometry';
import { getEngine, getSession } from './runtime';
import {
  flashStatus,
  setEditor,
  setMapPrefs,
  type ToolName,
  useEditor,
  useMapPrefs,
} from './stores';
import { S } from './strings';

export function selectTool(tool: ToolName): void {
  getEngine()?.setTool(tool);
}

/** 圖片（F156）：選一張圖放在原點 */
export async function pickImage(): Promise<void> {
  const eng = getEngine();
  if (!eng) return;
  const [file] = await pickFiles({ accept: 'image/*' });
  if (!file) return;
  await addImageFile(file);
}

export async function addImageFile(file: File, at?: { x: number; y: number }): Promise<boolean> {
  const eng = getEngine();
  if (!eng) return false;
  try {
    const ok = await eng.addImage(await readAsDataUrl(file), at);
    if (!ok) flashStatus(S.status.imageFailed);
    return ok;
  } catch {
    flashStatus(S.status.imageFailed);
    return false;
  }
}

export function undo(): void {
  void getEngine()?.undo();
}

export function redo(): void {
  void getEngine()?.redo();
}

export function saveNow(): void {
  void getSession()?.save();
}

/** 匯出圖片（F180）：選範圍 */
export function startExport(): void {
  const eng = getEngine();
  if (!eng) return;
  eng.setTool('select');
  eng.canvas.discardActiveObject();
  eng.canvas.requestRenderAll();
  setEditor({ exportMode: 'pick', exportRect: null });
}

export function cancelExport(): void {
  const eng = getEngine();
  setEditor({ exportMode: 'off', exportRect: null });
  eng?.cancelDraw();
  eng?.canvas.requestRenderAll();
}

/** R／Shift＋R：選取時旋轉物件；裝飾工具時轉預覽；其他時候 R＝矩形工具（F064、F123） */
export function rotateKey(reverse: boolean): void {
  const eng = getEngine();
  if (!eng) return;
  if (eng.activeTool === 'decor') {
    setMapPrefs({
      decorRotation: nextRotateStop(useMapPrefs.getState().decorRotation || 0, reverse),
    });
    return;
  }
  if (eng.activeTool === 'select' && selected(eng).length) {
    rotateSelected(eng, reverse);
    return;
  }
  if (!reverse) eng.setTool('rect');
}

export function deleteKey(): void {
  const eng = getEngine();
  if (eng?.activeTool !== 'select') return;
  deleteSelected(eng);
}

export function nudgeKey(dx: number, dy: number, big: boolean): void {
  const eng = getEngine();
  if (eng?.activeTool !== 'select') return;
  nudgeSelected(eng, dx, dy, big);
}

export function finishKey(): void {
  getEngine()?.finishDraw();
}

export function escapeKey(): void {
  const eng = getEngine();
  if (!eng) return;
  if (useEditor.getState().exportMode === 'pick') {
    cancelExport();
    return;
  }
  if (!eng.cancelDraw() && eng.activeTool === 'select') {
    eng.canvas.discardActiveObject();
    eng.canvas.requestRenderAll();
  }
}

export const act = {
  group: () => {
    const e = getEngine();
    if (e) groupSelected(e);
  },
  ungroup: () => {
    const e = getEngine();
    if (e) ungroupSelected(e);
  },
  duplicate: () => {
    const e = getEngine();
    if (e) void duplicateSelected(e);
  },
  visibility: () => {
    const e = getEngine();
    if (e) toggleVisibilitySelected(e);
  },
  lock: () => {
    const e = getEngine();
    if (e) toggleLockSelected(e);
  },
  front: () => {
    const e = getEngine();
    if (e) bringSelectedToFront(e);
  },
  back: () => {
    const e = getEngine();
    if (e) sendSelectedToBack(e);
  },
  delete: () => {
    const e = getEngine();
    if (e) deleteSelected(e);
  },
};
