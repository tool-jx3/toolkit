/**
 * 快捷鍵（規格 4.3、F261、F284）：動作清單、預設按鍵、錄製時把按鍵事件換成組合字串。
 * 「跳到場景頁的快速建立」原本是 Mod＋Shift＋N，但 Chrome 保留這個組合（開無痕視窗）、網頁收不到，預設改成 Alt＋N。
 * 重做另外也認 Mod＋Y（第 7 節裁定 D10）。
 */
import { isMac } from '@/ui';

export type ActionGroup = 'basic' | 'view' | 'pages' | 'parts';

export interface ActionDef {
  id: string;
  group: ActionGroup;
  keys: string;
  /** 在輸入欄裡也有效（儲存類） */
  inInput?: boolean;
}

export const ACTIONS: readonly ActionDef[] = [
  { id: 'undo', group: 'basic', keys: 'mod+z' },
  { id: 'redo', group: 'basic', keys: 'mod+shift+z' },
  { id: 'save', group: 'basic', keys: 'mod+s', inInput: true },
  { id: 'saveAs', group: 'basic', keys: 'mod+shift+s', inInput: true },
  { id: 'export', group: 'basic', keys: 'mod+e' },
  { id: 'toggleRight', group: 'view', keys: 'mod+b' },
  { id: 'toggleBottom', group: 'view', keys: 'mod+j' },
  { id: 'toggleTheme', group: 'view', keys: 'mod+shift+l' },
  { id: 'prevScene', group: 'view', keys: 'alt+arrowup' },
  { id: 'nextScene', group: 'view', keys: 'alt+arrowdown' },
  { id: 'quickScene', group: 'view', keys: 'alt+n' },
  { id: 'goMaterials', group: 'pages', keys: 'alt+1' },
  { id: 'goScenes', group: 'pages', keys: 'alt+2' },
  { id: 'goMarkers', group: 'pages', keys: 'alt+3' },
  { id: 'goTachie', group: 'pages', keys: 'alt+4' },
  { id: 'goPanels', group: 'pages', keys: 'alt+5' },
  { id: 'goCutins', group: 'pages', keys: 'alt+6' },
  { id: 'goPieces', group: 'pages', keys: 'alt+7' },
  { id: 'goStory', group: 'pages', keys: 'alt+8' },
  { id: 'goRoom', group: 'pages', keys: 'alt+9' },
  { id: 'goSettings', group: 'pages', keys: 'alt+0' },
  { id: 'goSave', group: 'pages', keys: '' },
  { id: 'partOpen', group: 'parts', keys: 'mod+1' },
  { id: 'partLock', group: 'parts', keys: 'mod+2' },
  { id: 'partVisible', group: 'parts', keys: 'mod+3' },
];

/** 目前的按鍵（使用者改過的優先；空字串＝未設定） */
export function keyOf(id: string, custom: Record<string, string>): string {
  if (Object.hasOwn(custom, id)) return custom[id];
  return ACTIONS.find((a) => a.id === id)?.keys ?? '';
}

const MODIFIERS = new Set(['control', 'shift', 'alt', 'meta', 'os', 'altgraph']);

/** 錄製：按鍵事件 → 組合字串（單獨按修飾鍵時 null） */
export function comboFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  mac = isMac(),
): string | null {
  const k = e.key.toLowerCase();
  if (MODIFIERS.has(k)) return null;
  let key = k;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (k === ' ') key = 'space';
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push('mod');
  if (mac && e.ctrlKey) parts.push('ctrl');
  if (!mac && e.metaKey) parts.push('meta');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

/** 比對用：同一個組合的不同寫法（順序）視為相同 */
export function sameCombo(a: string, b: string): boolean {
  const norm = (s: string) => {
    const p = s.toLowerCase().split('+');
    const key = p.pop() ?? '';
    return `${p.sort().join('+')}+${key}`;
  };
  return !!a && !!b && norm(a) === norm(b);
}
