/**
 * 快捷鍵：定義、比對、顯示文字，以及 useShortcuts() 綁定。
 *
 * 按鍵寫法（不分大小寫，用 + 連接）：'mod+z'（Mac 為 ⌘，其他為 Ctrl）、'shift+mod+z'、'space'、'?'、
 * 'arrowleft'、'home'、'k'。同一功能有多組按鍵時傳陣列。
 * **實體按鍵位置**：最後一段寫成 `code:<KeyboardEvent.code>`（例 'alt+code:digit1'、'alt+code:minus'）時比對
 * 按鍵的位置（`event.code`）而不是產生的字元——Mac 的 Option＋數字會產生「¡」等特殊字元、`event.key` 對不上，
 * 用位置比對就能和 Windows 的 Alt＋數字共用同一組快捷鍵；這種寫法 Shift 一律要相符（scenario-cards 移植時新增）。
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
  /**
   * 在輸入框裡也觸發（預設否）。ShortcutHelp 會在這一列標示「輸入框裡也可用」。
   * 帶 Ctrl／⌘／Alt 的空白鍵、Enter 組合在按鈕、連結、開關上也觸發（不讓給按鈕本身）。
   */
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
  /** `code:` 寫法：比對 event.code（小寫）；這時 key 是空字串 */
  code?: string;
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
  const code = raw.startsWith('code:') ? raw.slice(5) : undefined;
  return {
    key: code !== undefined ? '' : (KEY_ALIASES[raw] ?? raw),
    ...(code !== undefined ? { code } : {}),
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
  if (c.code !== undefined) {
    /* 實體按鍵位置（Mac 的 Option＋數字產生的是特殊字元，key 對不上） */
    if ((e.code ?? '').toLowerCase() !== c.code) return false;
  } else {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (key !== c.key) return false;
  }
  const wantCtrl = c.ctrl || (c.mod && !mac);
  const wantMeta = c.meta || (c.mod && mac);
  if (e.ctrlKey !== wantCtrl || e.metaKey !== wantMeta || e.altKey !== c.alt) return false;
  /* 符號鍵（?、!、+）本身就要按 Shift，不檢查 Shift（實體按鍵位置的寫法一律檢查） */
  const isSymbol = c.code === undefined && c.key.length === 1 && !/[a-z0-9 ]/.test(c.key);
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
  if (c.code !== undefined) out.push(codeLabel(c.code));
  else out.push(LABELS[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  return out;
}

/** 實體按鍵位置（event.code，小寫）在美式鍵盤上的字樣：digit1 → 1、keya → A、minus → - */
const CODE_LABELS: Record<string, string> = {
  minus: '-',
  equal: '=',
  bracketleft: '[',
  bracketright: ']',
  backslash: '\\',
  semicolon: ';',
  quote: "'",
  comma: ',',
  period: '.',
  slash: '/',
  backquote: '`',
  space: LABELS[' '],
};

function codeLabel(code: string): string {
  const digit = /^digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const letter = /^key([a-z])$/.exec(code);
  if (letter) return letter[1].toUpperCase();
  const pad = /^numpad(\d)$/.exec(code);
  if (pad) return `數字鍵 ${pad[1]}`;
  return CODE_LABELS[code] ?? LABELS[code] ?? code;
}

/**
 * 按鍵組合的一段提示文字（按鈕提示、說明文字用）：'mod+z' → 'Ctrl＋Z'；Mac 上 → '⌘Z'
 * （Mac 依慣例不加分隔，'shift+mod+z' → '⇧⌘Z'）。
 */
export function comboText(combo: string, mac = isMac()): string {
  const parts = formatCombo(combo, mac);
  if (!mac) return parts.join('＋');
  /* Mac 的修飾鍵依 ⌃⌥⇧⌘ 的順序 */
  const order = ['⌃', '⌥', '⇧', '⌘'];
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, key].join('');
}

/** 標籤加上快捷鍵提示：withShortcut('復原', 'mod+z') → '復原（Ctrl＋Z）'（Mac：'復原（⌘Z）'） */
export function withShortcut(label: string, combo: string, mac = isMac()): string {
  return `${label}（${comboText(combo, mac)}）`;
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
 * 標記「焦點在我身上時，工具快捷鍵照常作用」的屬性：`data-shortcuts="pass"`。
 * 給 role=slider 之類、只用少數幾個鍵的自訂控制項（例如 CropFrame 只用方向鍵）：
 * 它自己用的鍵在 keydown 時 preventDefault（useShortcuts 會略過已處理的按鍵），其餘的鍵交給工具。
 */
export const SHORTCUTS_PASS = { 'data-shortcuts': 'pass' } as const;

const passesShortcuts = (t: HTMLElement) => t.dataset.shortcuts === 'pass';

/**
 * 表單控制項（開關、勾選、選單、滑桿、輸入欄）：單一按鍵的快捷鍵在這些元素上不觸發。
 * 標了 `data-shortcuts="pass"`（SHORTCUTS_PASS）的元素不算。
 */
export function isFormControlTarget(t: EventTarget | null): boolean {
  if (isEditableTarget(t)) return true;
  if (!(t instanceof HTMLElement)) return false;
  if (passesShortcuts(t)) return false;
  if (t instanceof HTMLInputElement) return true;
  const role = t.getAttribute('role');
  return (
    !!role &&
    [
      'switch',
      'checkbox',
      'radio',
      'combobox',
      'slider',
      'listbox',
      'option',
      'menuitem',
      'menuitemradio',
      'menuitemcheckbox',
      'spinbutton',
      'textbox',
    ].includes(role)
  );
}

/**
 * 綁定快捷鍵（掛在 window）。對話框開著時、在輸入框裡打字時不觸發（除非 allowInInput）；
 * 沒有修飾鍵的單鍵快捷鍵，焦點在開關、選單、滑桿等表單控制項上時也不觸發
 * （標了 `data-shortcuts="pass"` 的控制項例外，例如 CropFrame：它沒用到的鍵照常觸發）。
 * 已經被元件處理（preventDefault）的按鍵不觸發。
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
        /* 沒有 Ctrl／⌘／Alt 的單鍵快捷鍵（例如 G、D）在開關、選單等表單控制項上也不觸發 */
        if (!s.allowInInput && !e.ctrlKey && !e.metaKey && !e.altKey && isFormControlTarget(target))
          return;
        /* 焦點在按鈕上時，空白鍵／Enter 留給按鈕本身（allowInInput 的 Ctrl／⌘／Alt 組合除外：那是整頁都要能用的快捷鍵） */
        if (
          (e.key === ' ' || e.key === 'Enter') &&
          !(s.allowInInput && (e.ctrlKey || e.metaKey || e.altKey)) &&
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
