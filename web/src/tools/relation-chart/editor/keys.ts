/**
 * 鍵盤操作（規格 1.13）。說明表交給共用外框（按 ? 打開）；實際處理在 handleKeyDown（有些按鍵要看狀態才攔）。
 */
import { isEditableTarget, isFormControlTarget, type Shortcut } from '@/ui';
import { clampToCanvas, sheetCtx } from '../engine/geom';
import type { Sheet } from '../model/types';
import { deleteChars, endLink } from '../state/actions';
import {
  activeSheet,
  holdHistory,
  releaseHistory,
  setUi,
  updateProject,
  useUi,
} from '../state/store';
import { S } from '../strings';
import { saveProjectFile } from './files';
import { redo, undo } from './undo';
import { fitView, zoomBy } from './view';

const K = S.keys;

export const SHORTCUT_HELP: Shortcut[] = [
  { keys: 'mod+z', label: K.undo, group: K.edit },
  { keys: ['shift+mod+z', 'mod+y'], label: K.redo, group: K.edit },
  { keys: ['delete', 'backspace'], label: K.del, group: K.edit },
  { keys: 'mod+a', label: K.selectAll, group: K.edit },
  { keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'], label: K.nudge, group: K.edit },
  { keys: 'escape', label: K.esc, group: K.edit },
  { keys: 'mod+s', label: K.save, group: K.file },
  { keys: ['+', '='], label: K.zoomIn, group: K.view },
  { keys: '-', label: K.zoomOut, group: K.view },
  { keys: '0', label: K.fit, group: K.view },
];

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const inDialog = (t: EventTarget | null) =>
  t instanceof Element &&
  !!t.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]');
const dialogOpen = () =>
  !!useUi.getState().dialog || !!document.querySelector('[role="dialog"],[role="alertdialog"]');

/** 連續方向鍵算一步：停 0.5 秒才記 */
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
function nudge(dx: number, dy: number): void {
  const sel = new Set(useUi.getState().sel);
  if (!sel.size) return;
  holdHistory('nudge');
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))] as Sheet;
    const ctx = sheetCtx(s);
    for (const c of s.chars) {
      if (!sel.has(c.id)) continue;
      c.x += dx;
      c.y += dy;
      clampToCanvas(ctx, c);
    }
  });
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    releaseHistory('nudge');
  }, 500);
}

/** Esc：結束建立關係 → 關掉編輯面板 → 取消聚焦 → 取消選取 */
function escapeChain(): boolean {
  const u = useUi.getState();
  if (u.link) endLink();
  else if (u.panel) setUi({ panel: null });
  else if (u.focus || u.hover) setUi({ focus: null, hover: null });
  else if (u.sel.length) setUi({ sel: [] });
  else return false;
  return true;
}

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  const t = e.target;
  const mod = e.ctrlKey || e.metaKey;
  /* Ctrl＋S 在輸入欄裡也可以 */
  if (mod && !e.altKey && e.code === 'KeyS' && !inDialog(t)) {
    e.preventDefault();
    void saveProjectFile();
    return;
  }
  if (inDialog(t) || dialogOpen()) return;
  if (e.key === 'Escape') {
    if (isEditableTarget(t)) return;
    if (escapeChain()) e.preventDefault();
    return;
  }
  if (isEditableTarget(t)) return;
  if (mod) {
    if (e.altKey) return;
    if (e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.code === 'KeyY') {
      e.preventDefault();
      redo();
    } else if (e.code === 'KeyA') {
      e.preventDefault();
      setUi({ sel: activeSheet().chars.map((c) => c.id), panel: null });
    }
    return;
  }
  if (e.altKey || isFormControlTarget(t)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const sel = useUi.getState().sel;
    if (!sel.length) return;
    e.preventDefault();
    deleteChars(sel);
    setUi({ sel: [] });
    return;
  }
  const arrow = ARROWS[e.key];
  if (arrow) {
    if (!useUi.getState().sel.length) return;
    e.preventDefault();
    const k = e.shiftKey ? 10 : 1;
    nudge(arrow[0] * k, arrow[1] * k);
    return;
  }
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    zoomBy(1.25);
  } else if (e.key === '-') {
    e.preventDefault();
    zoomBy(1 / 1.25);
  } else if (e.key === '0') {
    e.preventDefault();
    fitView();
  }
}
