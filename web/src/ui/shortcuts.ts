/**
 * 快捷鍵：定義、比對、顯示文字，以及 useShortcuts() 綁定。
 *
 * 按鍵寫法（不分大小寫，用 + 連接）：'mod+z'（Mac 為 ⌘，其他為 Ctrl）、'shift+mod+z'、'space'、'?'、
 * 'arrowleft'、'home'、'k'。同一功能有多組按鍵時傳陣列。
 */
import { useEffect, useRef } from 'react';

export interface Shortcut {
  keys: string | readonly string[];
  /** 說明，例如「播放／暫停」 */
  label: string;
  /** ShortcutHelp 裡的分組，例如「播放」「編輯」 */
  group?: string;
  /** 沒有 handler 的只顯示在說明裡（例如由元件自己處理的按鍵） */
  handler?: (e: KeyboardEvent) => void;
  /** 在輸入框裡也觸發（預設否） */
  allowInInput?: boolean;
}

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '',
  );

const KEY_ALIASES: Record<string, string> = {
  space: ' ',
  spacebar: ' ',
  esc: 'escape',
  del: 'delete',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  plus: '+',
};

interface Combo {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export function parseCombo(combo: string): Combo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((s) => s.trim());
  /* 'mod++' 這種寫法：最後一段是空字串代表「+」鍵 */
  const raw = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  return {
    key: KEY_ALIASES[raw] ?? raw,
    mod: mods.has('mod'),
    ctrl: mods.has('ctrl'),
    meta: mods.has('meta') || mods.has('cmd'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  };
}

/** 鍵盤事件是否符合按鍵組合 */
export function matchCombo(e: KeyboardEvent, combo: string, mac = isMac()): boolean {
  const c = parseCombo(combo);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (key !== c.key) return false;
  const wantCtrl = c.ctrl || (c.mod && !mac);
  const wantMeta = c.meta || (c.mod && mac);
  if (e.ctrlKey !== wantCtrl || e.metaKey !== wantMeta || e.altKey !== c.alt) return false;
  /* 符號鍵（?、!、+）本身就要按 Shift，不檢查 Shift */
  const isSymbol = c.key.length === 1 && !/[a-z0-9 ]/.test(c.key);
  return isSymbol || e.shiftKey === c.shift;
}

const LABELS: Record<string, string> = {
  ' ': '空白鍵',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'Esc',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  tab: 'Tab',
};

/** 'shift+mod+z' → ['Shift', 'Ctrl', 'Z']（Mac：['⇧', '⌘', 'Z']） */
export function formatCombo(combo: string, mac = isMac()): string[] {
  const c = parseCombo(combo);
  const out: string[] = [];
  if (c.ctrl || (c.mod && !mac)) out.push(mac ? '⌃' : 'Ctrl');
  if (c.meta || (c.mod && mac)) out.push(mac ? '⌘' : 'Win');
  if (c.alt) out.push(mac ? '⌥' : 'Alt');
  if (c.shift) out.push(mac ? '⇧' : 'Shift');
  out.push(LABELS[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  return out;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'].includes(
      t.type,
    );
  }
  return t.getAttribute('role') === 'spinbutton' || t.getAttribute('role') === 'textbox';
}

/**
 * 綁定快捷鍵（掛在 window）。對話框開著時、在輸入框裡打字時不觸發（除非 allowInInput）。
 * shortcuts 每次 render 換新陣列也沒關係。
 */
export function useShortcuts(shortcuts: readonly Shortcut[], enabled = true): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target;
      const inDialog =
        target instanceof Element &&
        !!target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]');
      for (const s of ref.current) {
        if (!s.handler) continue;
        const keys = typeof s.keys === 'string' ? [s.keys] : s.keys;
        if (!keys.some((k) => matchCombo(e, k))) continue;
        if (inDialog) return;
        if (!s.allowInInput && isEditableTarget(target)) return;
        /* 焦點在按鈕上時，空白鍵／Enter 留給按鈕本身 */
        if (
          (e.key === ' ' || e.key === 'Enter') &&
          target instanceof HTMLElement &&
          target.closest('button,a,[role="slider"],[role="switch"],[role="tab"],[role="radio"]')
        )
          return;
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
