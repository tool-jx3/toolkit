/**
 * 「進階設定」開關：打開後才顯示標「進階」的項目。記在這個瀏覽器裡（localStorage
 * `trpg-toolkit:<工具 id>:advanced`），下次開頁沿用；同一頁裡所有用到同一個工具 id 的地方同步。
 *
 * ```tsx
 * const [advanced] = useAdvancedMode('cutin');
 * <AdvancedToggle toolId="cutin" />
 * <Show when={advanced}><Field label="字距">…</Field></Show>
 * ```
 */
import { useCallback, useSyncExternalStore } from 'react';
import { Toggle } from './Toggle';

const keyOf = (toolId: string) => `trpg-toolkit:${toolId}:advanced`;
const listeners = new Set<() => void>();

function read(toolId: string): boolean {
  try {
    return localStorage.getItem(keyOf(toolId)) === '1';
  } catch {
    return false;
  }
}

/** 直接讀寫（不在 React 裡時用） */
export function getAdvancedMode(toolId: string): boolean {
  return read(toolId);
}

export function setAdvancedMode(toolId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(keyOf(toolId), '1');
    else localStorage.removeItem(keyOf(toolId));
  } catch {
    /* 無痕模式等存不了時，只在這次開頁有效 */
    memory.set(toolId, on);
  }
  for (const l of listeners) l();
}

/** 存不進瀏覽器時的備用值 */
const memory = new Map<string, boolean>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.endsWith(':advanced')) cb();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** 目前是否顯示進階設定，以及切換的函式 */
export function useAdvancedMode(toolId: string): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => memory.get(toolId) ?? read(toolId),
    () => false,
  );
  const set = useCallback((v: boolean) => setAdvancedMode(toolId, v), [toolId]);
  return [on, set];
}

export interface AdvancedToggleProps {
  toolId: string;
  /** 預設「顯示進階設定」 */
  label?: string;
  className?: string;
}

/** 進階設定的開關（記在瀏覽器裡） */
export function AdvancedToggle({ toolId, label = '顯示進階設定', className }: AdvancedToggleProps) {
  const [on, set] = useAdvancedMode(toolId);
  return <Toggle label={label} checked={on} onCheckedChange={set} className={className} />;
}
