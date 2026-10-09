/**
 * 鍵盤操作。說明表（SHORTCUT_HELP）交給共用外框顯示（按 ? 打開）；實際的處理在 handleKeyDown，
 * 因為有些按鍵要看狀態才攔（例如方向鍵、Ctrl＋C 只在有選取時才作用，否則交給瀏覽器）。
 */
import { isEditableTarget, isFormControlTarget, type Shortcut } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { openProjectFile, saveProjectFile } from './files';
import { setEditor, type ToolId, useEditor, usePrefs, useProject } from './store';

const K = S.keys;

export const SHORTCUT_HELP: Shortcut[] = [
  { keys: 'v', label: K.select, group: K.tools },
  { keys: ['h', 'space'], label: K.hand, group: K.tools },
  { keys: 'b', label: K.room, group: K.tools },
  { keys: 'w', label: K.wall, group: K.tools },
  { keys: 'd', label: K.door, group: K.tools },
  { keys: 'n', label: K.window, group: K.tools },
  { keys: 't', label: K.text, group: K.tools },
  { keys: 'e', label: K.eraser, group: K.tools },
  { keys: 'r', label: K.rotate, group: K.edit },
  { keys: 'f', label: K.flip, group: K.edit },
  { keys: 'l', label: K.lock, group: K.edit },
  { keys: ['delete', 'backspace'], label: K.del, group: K.edit },
  { keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: K.nudge, group: K.edit },
  { keys: 'mod+z', label: K.undo, group: K.edit },
  { keys: ['shift+mod+z', 'mod+y'], label: K.redo, group: K.edit },
  { keys: 'mod+c', label: K.copy, group: K.edit },
  { keys: 'mod+x', label: K.cut, group: K.edit },
  { keys: 'mod+v', label: K.paste, group: K.edit },
  { keys: 'mod+d', label: K.duplicate, group: K.edit },
  { keys: 'mod+a', label: K.selectAll, group: K.edit },
  { keys: 'escape', label: K.esc, group: K.edit },
  { keys: 'mod+s', label: K.save, group: K.file },
  { keys: 'mod+o', label: K.open, group: K.file },
  { keys: 'mod+e', label: K.export, group: K.file },
  { keys: 'g', label: K.grid, group: K.view },
  { keys: 'p', label: K.pl, group: K.view },
  { keys: 'c', label: K.clues, group: K.view },
  { keys: '0', label: K.fit, group: K.view },
  { keys: ['+', '='], label: K.zoomIn, group: K.view },
  { keys: '-', label: K.zoomOut, group: K.view },
  { keys: '[', label: K.floorDown, group: K.view },
  { keys: ']', label: K.floorUp, group: K.view },
];

const TOOL_KEYS: Record<string, ToolId> = {
  KeyV: 'select',
  KeyH: 'hand',
  KeyB: 'room',
  KeyW: 'wall',
  KeyD: 'door',
  KeyN: 'window',
  KeyT: 'text',
  KeyE: 'eraser',
};

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function modalOpen(): boolean {
  const s = useEditor.getState();
  return (
    s.templatesOpen ||
    s.exportOpen ||
    !!document.querySelector('[role="dialog"],[role="alertdialog"]')
  );
}

/**
 * 輸入欄（文字、多行、數字）裡按 Esc：離開輸入欄（和原作一樣；F174）。在捕捉階段登記、等這次按鍵處理完才離開，
 * 所以欄位自己的 Esc 照常先做（數字欄還原打到一半的字、樓層改名取消）；對話框、選單裡的不管（Esc 照舊關對話框）。
 */
export function handleEscapeCapture(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing) return;
  const target = e.target;
  if (!(target instanceof HTMLElement) || !isEditableTarget(target)) return;
  if (target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return;
  if (modalOpen()) return;
  setTimeout(() => {
    if (document.activeElement === target) target.blur();
  }, 0);
}

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  const target = e.target;
  if (
    target instanceof Element &&
    target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')
  )
    return;
  if (modalOpen()) return;
  const ed = useEditor.getState();
  if (e.key === 'Escape') {
    if (isEditableTarget(target)) return;
    if (editor.cancelDrag()) {
      e.preventDefault();
      return;
    }
    if (ed.tool !== 'select') act.setTool('select');
    else if (ed.sel.length) setEditor({ sel: [] });
    return;
  }
  if (isEditableTarget(target)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (e.altKey) return;
    const has = ed.sel.length > 0;
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    switch (e.code) {
      case 'KeyZ':
        run(e.shiftKey ? act.redo : act.undo);
        return;
      case 'KeyY':
        run(act.redo);
        return;
      case 'KeyS':
        run(saveProjectFile);
        return;
      case 'KeyO':
        run(() => void openProjectFile());
        return;
      case 'KeyE':
        run(() => setEditor({ exportOpen: true }));
        return;
      case 'KeyA':
        run(act.selectAll);
        return;
      case 'KeyD':
        run(act.duplicateSelection);
        return;
      case 'KeyC':
        if (has) run(() => act.copySelection(false));
        return;
      case 'KeyX':
        if (has) run(() => act.copySelection(true));
        return;
      case 'KeyV':
        if (ed.clipboard) run(act.paste);
        return;
    }
    return;
  }
  if (e.altKey) return;
  if (e.code === 'Space' || e.key === ' ') {
    /* 焦點在按鈕等元素上時，空白鍵照常按下那個按鈕 */
    if (target !== document.body && target !== editor.canvas) return;
    e.preventDefault();
    editor.setSpace(true);
    return;
  }
  if (isFormControlTarget(target)) return;
  if (e.key === 'Enter' && target instanceof HTMLElement && target.closest('button,a')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (ed.sel.length) {
      e.preventDefault();
      act.deleteSelection();
    }
    return;
  }
  const arrow = ARROWS[e.key];
  if (arrow) {
    if (!ed.sel.length) return;
    e.preventDefault();
    act.nudge(arrow[0], arrow[1], e.shiftKey);
    return;
  }
  if (e.shiftKey && e.key !== '+') return;
  switch (e.code) {
    case 'KeyR':
      act.rotateKey(() => editor.refreshHover());
      return;
    case 'KeyF':
      act.flipSelection();
      return;
    case 'KeyL':
      act.toggleLock();
      return;
    case 'KeyG':
      act.toggleGrid();
      return;
    case 'KeyP':
      act.setPlayerView(!ed.playerView);
      return;
    case 'KeyC':
      act.setShowClues(!usePrefs.getState().data.showClues);
      return;
  }
  switch (e.key) {
    case '0':
      editor.fitView();
      return;
    case '+':
    case '=':
    case ';':
      editor.zoomBy(1.25);
      return;
    case '-':
      editor.zoomBy(0.8);
      return;
    case '[':
      act.switchFloor(useProject.getState().data.active - 1);
      return;
    case ']':
      act.switchFloor(useProject.getState().data.active + 1);
      return;
  }
  const tool = TOOL_KEYS[e.code];
  if (tool) {
    e.preventDefault();
    act.setTool(tool);
  }
}

export function handleKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Space' || e.key === ' ') editor.setSpace(false);
}
