/**
 * 鍵盤操作。說明表交給共用外框顯示（按 ? 打開）；實際的處理在 handleKeyDown（有些按鍵要看狀態才攔）。
 * 輸入框、選單裡打字時不攔（Ctrl＋S 例外）；滑桿上的方向鍵照滑桿原本的操作；按鈕、勾選框按過之後
 * Space 照樣是移動畫面、方向鍵照樣移動選取的東西。
 */
import { arrowDelta } from '@/core/layout';
import { isEditableTarget, type Shortcut } from '@/ui';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { saveProjectFile } from './files';
import { type ToolId, useEditor } from './store';

const K = S.keys;

export const SHORTCUT_HELP: Shortcut[] = [
  { keys: 'v', label: K.select, group: K.tools },
  { keys: 'b', label: K.brush, group: K.tools },
  { keys: 'e', label: K.erase, group: K.tools },
  { keys: ['h', 'space'], label: K.hand, group: K.tools },
  { keys: 't', label: K.note, group: K.tools },
  { keys: 'mod+z', label: K.undo, group: K.edit },
  { keys: ['shift+mod+z', 'mod+y'], label: K.redo, group: K.edit },
  { keys: 'mod+d', label: K.duplicate, group: K.edit },
  { keys: ['delete', 'backspace'], label: K.del, group: K.edit },
  { keys: 'f', label: K.flip, group: K.edit },
  { keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: K.nudge, group: K.edit },
  { keys: 'enter', label: K.enter, group: K.edit },
  { keys: 'backspace', label: K.backspace, group: K.edit },
  { keys: 'escape', label: K.esc, group: K.edit },
  { keys: '0', label: K.fit, group: K.view },
  { keys: ['+', '='], label: K.zoomIn, group: K.view },
  { keys: '-', label: K.zoomOut, group: K.view },
  { keys: 'mod+s', label: K.save, group: K.file, allowInInput: true },
];

const TOOL_KEYS: Record<string, ToolId> = {
  KeyV: 'select',
  KeyB: 'brush',
  KeyE: 'erase',
  KeyH: 'hand',
  KeyT: 'note',
};

const isRange = (t: EventTarget | null) => t instanceof HTMLInputElement && t.type === 'range';

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.isComposing || document.querySelector('[role="dialog"]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 's') {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    saveProjectFile();
    return;
  }
  const target = e.target;
  if (
    isEditableTarget(target) ||
    (target instanceof HTMLElement && target.closest('select,[role="listbox"],[role="menu"]'))
  )
    return;
  const st = useEditor.getState();
  const drafting = st.draftCount > 0;
  if (drafting && (e.key === 'Backspace' || (mod && !e.shiftKey && key === 'z'))) {
    e.preventDefault();
    editor.popDraftPoint();
    return;
  }
  if (mod && (key === 'z' || key === 'y' || key === 'd')) {
    e.preventDefault();
    if (key === 'z') (e.shiftKey ? act.redo : act.undo)();
    else if (key === 'y') act.redo();
    else act.duplicateSelected();
    return;
  }
  if (isRange(target) && e.key.startsWith('Arrow')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (target instanceof HTMLElement && target.closest('button,input')) target.blur();
    editor.setSpace(true);
    return;
  }
  if (e.key === 'Escape') {
    if (drafting) editor.cancelDraft();
    else {
      useEditor.setState({ sel: null });
      act.setTool('select');
    }
    return;
  }
  if (e.key === 'Enter' && drafting) {
    e.preventDefault();
    editor.finishDraft();
    return;
  }
  if (mod || e.altKey) return;
  if (e.key === '0') {
    editor.fitView();
    return;
  }
  if (e.key === '+' || e.key === '=') {
    editor.zoomBy(1.25);
    return;
  }
  if (e.key === '-') {
    editor.zoomBy(0.8);
    return;
  }
  if (st.audience === 'player') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!st.sel) return;
    e.preventDefault();
    act.deleteSelected();
    return;
  }
  if (key === 'f' && st.sel?.kind === 'object') {
    e.preventDefault();
    act.flipSelected();
    return;
  }
  const tool = TOOL_KEYS[e.code];
  if (tool) {
    e.preventDefault();
    act.setTool(tool);
    editor.canvas?.focus({ preventScroll: true });
    return;
  }
  /* 方向鍵移動選取的東西（Shift：一格 12 px） */
  const nudge = st.sel ? arrowDelta(e.key, e.shiftKey ? 12 : 1) : null;
  if (nudge) {
    e.preventDefault();
    act.nudgeSelected(nudge.dx, nudge.dy);
    editor.canvas?.focus({ preventScroll: true });
  }
}

export function handleKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Space') editor.setSpace(false);
}
