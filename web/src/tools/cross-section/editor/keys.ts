/**
 * 鍵盤操作。說明表交給共用外框顯示（按 ? 打開）；實際的處理在 handleKeyDown（要看狀態才攔）。
 * 輸入框、選單裡打字時不攔（Ctrl＋S、Ctrl＋E 例外）；滑桿上的方向鍵照滑桿原本的操作；有對話框時不攔。
 */
import { arrowDelta } from '@/core/layout';
import { isEditableTarget, type Shortcut } from '@/ui';
import { ENV_IDS } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import { openExport } from './ExportDialog';
import { saveProjectFile } from './files';
import { useEditor } from './store';

const K = S.keys;

export const SHORTCUT_HELP: Shortcut[] = [
  { keys: 'v', label: K.select, group: K.tools },
  { keys: 't', label: K.note, group: K.tools },
  { keys: 'space', label: K.hand, group: K.tools },
  { keys: ['1', '2', '3', '4'], label: K.env, group: K.view },
  { keys: 'g', label: K.audience, group: K.view },
  { keys: '0', label: K.fit, group: K.view },
  { keys: ['+', '='], label: K.zoomIn, group: K.view },
  { keys: '-', label: K.zoomOut, group: K.view },
  { keys: 'mod+z', label: K.undo, group: K.edit },
  { keys: ['shift+mod+z', 'mod+y'], label: K.redo, group: K.edit },
  { keys: ['delete', 'backspace'], label: K.del, group: K.edit },
  { keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: K.nudge, group: K.edit },
  { keys: 'mod+d', label: K.duplicate, group: K.edit },
  { keys: 'escape', label: K.esc, group: K.edit },
  { keys: 'mod+s', label: K.save, group: K.file, allowInInput: true },
  { keys: 'mod+e', label: K.export, group: K.file, allowInInput: true },
];

const isRange = (t: EventTarget | null) => t instanceof HTMLInputElement && t.type === 'range';

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.isComposing || e.keyCode === 229 || document.querySelector('[role="dialog"]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && (key === 's' || key === 'e')) {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    if (key === 's') saveProjectFile();
    else openExport(null);
    return;
  }
  const target = e.target;
  if (
    isEditableTarget(target) ||
    (target instanceof HTMLElement && target.closest('select,[role="listbox"],[role="menu"]'))
  )
    return;
  const st = useEditor.getState();
  if (mod && (key === 'z' || key === 'y' || key === 'd')) {
    e.preventDefault();
    if (key === 'z') (e.shiftKey ? act.redo : act.undo)();
    else if (key === 'y') act.redo();
    else if (st.sel?.kind === 'item' && st.audience === 'gm') act.duplicateItem(st.sel.id);
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
    if (st.tool !== 'select') act.setTool('select');
    else useEditor.setState({ sel: null });
    return;
  }
  if (mod || e.altKey) return;
  const env = ['1', '2', '3', '4'].indexOf(e.key);
  if (env >= 0) {
    act.setEnv(ENV_IDS[env]);
    return;
  }
  if (key === 'g') {
    act.toggleAudience();
    return;
  }
  if (e.key === '0') {
    editor.fitView();
    return;
  }
  if (e.key === '+' || e.key === '=') {
    editor.zoomBy(1.22);
    return;
  }
  if (e.key === '-') {
    editor.zoomBy(1 / 1.22);
    return;
  }
  if (key === 'v') {
    act.setTool('select');
    return;
  }
  if (key === 't') {
    act.setTool('note');
    return;
  }
  if (st.audience === 'player') return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!st.sel || st.sel.kind === 'room') return;
    e.preventDefault();
    act.deleteSelected();
    return;
  }
  const d = st.sel ? arrowDelta(e.key, 1) : null;
  if (d) {
    e.preventDefault();
    act.nudgeSelected(d.dx, d.dy, e.shiftKey);
  }
}

export function handleKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Space') editor.setSpace(false);
}
