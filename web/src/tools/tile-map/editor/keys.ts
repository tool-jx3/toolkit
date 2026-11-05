/**
 * 鍵盤操作。說明表（SHORTCUT_HELP）交給共用外框顯示（按 ? 打開）；實際的處理在 handleKeyDown，
 * 因為有些按鍵要看狀態才攔（方向鍵、Delete 只在有選取時作用）。
 * 對話框、選單打開時、在輸入欄裡打字時都不作用；沒有修飾鍵的單鍵在按鈕、開關、選單上也不作用。
 */
import { isEditableTarget, isFormControlTarget, type Shortcut } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { openProjectFile, saveProjectFile } from './files';
import { cancelCurrentGesture, fitView, zoomBy } from './MapCanvas';
import { editorNow, type ToolId, usePrefs } from './store';

const K = S.keys;

export const SHORTCUT_HELP: Shortcut[] = [
  { keys: 's', label: K.selectK, group: K.tools },
  { keys: 'b', label: K.brushK, group: K.tools },
  { keys: 'e', label: K.eraserK, group: K.tools },
  { keys: 'g', label: K.fillK, group: K.tools },
  { keys: 'u', label: K.shapeK, group: K.tools },
  { keys: 'i', label: K.pickerK, group: K.tools },
  { keys: 'm', label: K.moveMapK, group: K.tools },
  { keys: 'r', label: K.rotate, group: K.edit },
  { keys: 'f', label: K.flip, group: K.edit },
  { keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: K.nudge, group: K.edit },
  { keys: ['delete', 'backspace'], label: K.del, group: K.edit },
  { keys: 'mod+a', label: K.selectAll, group: K.edit },
  { keys: 'escape', label: K.esc, group: K.edit },
  { keys: 'mod+z', label: K.undo, group: K.edit },
  { keys: ['shift+mod+z', 'mod+y'], label: K.redo, group: K.edit },
  { keys: 'mod+s', label: K.save, group: K.file },
  { keys: 'mod+o', label: K.open, group: K.file },
  { keys: 'space', label: K.pan, group: K.view },
  { keys: 'v', label: K.grid, group: K.view },
  { keys: '0', label: K.fit, group: K.view },
  { keys: ['+', '='], label: K.zoomIn, group: K.view },
  { keys: '-', label: K.zoomOut, group: K.view },
  { keys: 'f2', label: K.rename, group: K.view },
];

const TOOL_KEYS: Record<string, ToolId> = {
  KeyS: 'select',
  KeyB: 'brush',
  KeyE: 'eraser',
  KeyG: 'fill',
  KeyU: 'shape',
  KeyI: 'picker',
};

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const modalOpen = (): boolean =>
  editorNow().dialog !== null ||
  !!document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]');

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  const target = e.target;
  if (
    target instanceof Element &&
    target.closest(
      '[role="dialog"],[role="alertdialog"],[role="menu"],[data-radix-popper-content-wrapper]',
    )
  )
    return;
  if (modalOpen() || !editorNow().ready) return;
  if (isEditableTarget(target)) return;
  const ed = editorNow();
  const mod = e.ctrlKey || e.metaKey;
  const run = (fn: () => void) => {
    e.preventDefault();
    fn();
  };
  if (mod) {
    if (e.altKey) return;
    switch (e.code) {
      case 'KeyZ':
        run(e.shiftKey ? act.redo : act.undo);
        return;
      case 'KeyY':
        run(act.redo);
        return;
      case 'KeyS':
        run(() => void saveProjectFile());
        return;
      case 'KeyO':
        run(() => void openProjectFile());
        return;
      case 'KeyA':
        /* 調色盤自己處理（選這一組全部） */
        if (target instanceof Element && target.closest('[data-tile]')) return;
        run(act.selectAll);
        return;
    }
    return;
  }
  if (e.altKey) return;
  const fn = plainKey(e, ed, target);
  if (fn) {
    e.preventDefault();
    fn();
  }
}

/** 沒有 Ctrl／⌘ 的按鍵要做的事（不攔截時 null） */
function plainKey(
  e: KeyboardEvent,
  ed: ReturnType<typeof editorNow>,
  target: EventTarget | null,
): (() => void) | null {
  if (e.key === 'Escape') {
    if (cancelCurrentGesture()) return () => {};
    if (ed.tool === 'move-map') return () => act.setTool('select');
    if (ed.selection.length) return act.clearSelection;
    return null;
  }
  if (isFormControlTarget(target)) return null;
  if (ed.tool === 'select' && ed.selection.length) {
    const arrow = ARROWS[e.key];
    if (arrow) return () => act.applySelection('move', arrow[0], arrow[1]);
    if (e.key === 'Delete' || e.key === 'Backspace') return () => act.applySelection('delete');
  }
  if (e.repeat) return null;
  if (e.key === 'Enter' && target instanceof HTMLElement && target.closest('button,a')) return null;
  const tool = TOOL_KEYS[e.code];
  if (tool && !e.shiftKey) return () => act.setTool(tool);
  switch (e.key) {
    case 'm':
    case 'M':
      return () => act.setTool(ed.tool === 'move-map' ? 'select' : 'move-map');
    case 'r':
    case 'R':
      return act.rotate;
    case 'f':
    case 'F':
      return act.flip;
    case 'v':
    case 'V':
      return () => {
        const p = usePrefs.getState();
        p.patch({ grid: !p.data.grid });
      };
    case '0':
      return fitView;
    case '+':
    case '=':
      return () => zoomBy(1.25);
    case '-':
      return () => zoomBy(0.8);
    default:
      return null;
  }
}
