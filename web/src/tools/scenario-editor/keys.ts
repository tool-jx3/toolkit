/**
 * 鍵盤（F240、F241）與剪貼簿（F065、F066）。書式快捷鍵以實體按鍵位置判斷（e.code），按 Shift 改變字元時也對。
 */
import { copyText } from '@/core/files';
import { escapeHtml, escapeHtmlAttr } from '@/core/html';
import { isEditableTarget, type Shortcut } from '@/ui';
import { newBlock, TYPES } from './model/blocks';
import { blocksPlainText } from './model/count';
import type { Block } from './model/types';
import {
  clone,
  copyBlocks,
  deleteSel,
  indentSel,
  pasteBlocks,
  pasteParagraphs,
  typeButton,
} from './ops';
import { paperApi } from './Paper';
import { saveFile } from './session';
import { clearSelection, say, selectedBlocks, setUi, ui, useDoc, usePrefs } from './store';
import { S } from './strings';
import { addRuby } from './textOps';

/** e.code → 按鍵（Digit1 → '1'、KeyT → 'T'、BracketLeft → '['） */
export function keyOfCode(code: string): string {
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  return '';
}

/** 有沒有擋住原稿操作的對話框（彈出視窗編輯除外） */
export function blockingDialog(): boolean {
  const s = ui();
  if (s.libraryOpen || s.output || s.preview || s.npcEdit || s.flowEdit || s.tableWide) return true;
  /* 確認、輸入等共用的對話框 */
  const open = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(
    (el) =>
      !(el as HTMLElement).closest('[data-testid="se-popup-dialog"]') &&
      !(el as HTMLElement).querySelector('[data-testid="se-popup-dialog"]'),
  );
  return open.length > 0;
}

function undo(): void {
  useDoc.temporal.getState().undo();
}
function redo(): void {
  useDoc.temporal.getState().redo();
}

/** 整個視窗的按鍵 */
export function onWindowKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  if (blockingDialog()) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = keyOfCode(e.code);
  const editable = isEditableTarget(e.target);

  /* 整段複製／貼上（Ctrl＋Alt＋Shift＋C／V）：不管在哪裡 */
  if (mod && e.altKey && e.shiftKey && (k === 'C' || k === 'V')) {
    e.preventDefault();
    if (k === 'C') {
      const c = copyBlocks();
      if (c) void copyText(blocksPlainText(c));
    } else pasteBlocks();
    return;
  }
  /* 書式（Ctrl＋Shift＋鍵／Ctrl＋Alt＋鍵） */
  if ((mod && e.shiftKey && !e.altKey) || (e.ctrlKey && e.altKey && !e.shiftKey)) {
    const t = TYPES.find((x) => x.key === k);
    if (t) {
      e.preventDefault();
      void typeButton(t.k);
      return;
    }
  }
  if (mod && e.shiftKey && !e.altKey) {
    if (k === 'P') {
      e.preventDefault();
      const p = usePrefs.getState();
      p.patch({ overview: !p.data.overview });
      return;
    }
    if (k === 'R') {
      e.preventDefault();
      addRuby();
      return;
    }
    if (k === ']' || k === '[') {
      e.preventDefault();
      indentSel(k === ']' ? 1 : -1);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      paperApi.zoomBy(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (k === 'Z') {
      e.preventDefault();
      redo();
      return;
    }
  }
  if (mod && !e.shiftKey && !e.altKey) {
    if (k === 'S') {
      e.preventDefault();
      saveFile();
      return;
    }
    if (k === 'Z') {
      e.preventDefault();
      undo();
      return;
    }
    if (k === 'Y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault();
      paperApi.fit();
      return;
    }
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault();
      paperApi.zoomBy(1);
      return;
    }
    if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      paperApi.zoomBy(-1);
      return;
    }
  }
  if (editable || mod || e.altKey) return;
  if (isFormControl(e.target)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui().sel.length) {
    e.preventDefault();
    void deleteSel(false);
    return;
  }
  if (e.key === 'Escape' && ui().sel.length) {
    clearSelection();
  }
}

/** 選單、滑桿、勾選等控制項上的 Delete／Esc 留給它們（按鈕上照常作用） */
function isFormControl(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    !!t.closest('select,input,[role="slider"],[role="combobox"],[role="listbox"],[role="menu"]')
  );
}

/* ---------- 剪貼簿（純文字＋段落資料兩種格式；第 5 節第 5 項） ---------- */

const MARK = 'data-trpg-blocks';

export function blocksClipboardHtml(list: readonly Block[]): string {
  const plain = blocksPlainText(list);
  return `<meta charset="utf-8"><div ${MARK}="${escapeHtmlAttr(JSON.stringify(list))}">${escapeHtml(plain).replace(/\n/g, '<br>')}</div>`;
}

export function blocksFromClipboardHtml(html: string): Block[] | null {
  if (!html?.includes(MARK)) return null;
  try {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const raw = d.querySelector(`[${MARK}]`)?.getAttribute(MARK);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? (v as Block[]) : null;
  } catch {
    return null;
  }
}

function hasTextSelection(): boolean {
  const s = window.getSelection();
  return !!s && !s.isCollapsed && String(s).trim() !== '';
}

export function onCopy(e: ClipboardEvent): void {
  if (blockingDialog() || isEditableTarget(e.target) || isEditableTarget(document.activeElement))
    return;
  if (hasTextSelection() || !ui().sel.length) return;
  const list = selectedBlocks();
  if (!list.length || !e.clipboardData) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', blocksPlainText(list));
  e.clipboardData.setData('text/html', blocksClipboardHtml(list));
  setUi({ clip: clone(list) });
  say(S.status.textCopied(list.length));
}

export function onPaste(e: ClipboardEvent): void {
  if (blockingDialog() || isEditableTarget(e.target) || isEditableTarget(document.activeElement))
    return;
  const html = e.clipboardData?.getData('text/html') ?? '';
  const text = e.clipboardData?.getData('text/plain') ?? '';
  const blocks = blocksFromClipboardHtml(html);
  e.preventDefault();
  if (blocks?.length) {
    pasteBlocks(blocks);
    return;
  }
  const clip = ui().clip;
  if (clip?.length && (!text || text === blocksPlainText(clip))) {
    pasteBlocks(clip);
    return;
  }
  if (!text.trim()) return;
  const last = ui().sel.at(-1) ?? null;
  if (!pasteParagraphs(last, text)) pasteBlocks([newBlock('desc', text.replace(/\r\n?/g, '\n'))]);
}

/** 快捷鍵說明（ShortcutHelp 用；實際的處理在 onWindowKey） */
export function shortcutList(): Shortcut[] {
  const m = (x: string) => `mod+shift+${x}`;
  return [
    ...TYPES.map((t) => ({
      keys: [m(t.key.toLowerCase()), `ctrl+alt+${t.key.toLowerCase()}`],
      label: t.name,
      group: '書式',
      allowInInput: true,
    })),
    { keys: 'mod+shift+p', label: '頁面一覽', group: '畫面', allowInInput: true },
    { keys: ['mod+0'], label: '配合寬度', group: '畫面' },
    { keys: ['mod+=', 'mod+shift+arrowup'], label: '放大', group: '畫面' },
    { keys: ['mod+-', 'mod+shift+arrowdown'], label: '縮小', group: '畫面' },
    { keys: 'mod+shift+r', label: '加注音', group: '編輯', allowInInput: true },
    {
      keys: ['mod+shift+]', 'mod+shift+['],
      label: '縮排／退回',
      group: '編輯',
      allowInInput: true,
    },
    { keys: 'mod+z', label: '復原', group: '編輯', allowInInput: true },
    { keys: ['mod+y', 'mod+shift+z'], label: '重做', group: '編輯', allowInInput: true },
    { keys: 'mod+s', label: '儲存（存成檔案）', group: '檔案', allowInInput: true },
    {
      keys: ['mod+c', 'mod+v'],
      label: '整段複製／貼上（不在文字欄、沒有選取文字時）',
      group: '段落',
    },
    {
      keys: ['mod+alt+shift+c', 'mod+alt+shift+v'],
      label: '整段複製／貼上（不管在哪裡）',
      group: '段落',
      allowInInput: true,
    },
    { keys: ['delete', 'backspace'], label: '刪除選取的段落', group: '段落' },
    { keys: 'escape', label: '結束輸入／取消選取', group: '段落' },
  ];
}
