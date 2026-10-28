/**
 * 播放用的快捷鍵：空白鍵＝播放／暫停、Home＝回到開頭（暫停並停在第一格）。
 * 有自己的預覽播放列（Transport）的工具把這兩個放進 ToolShell 的 `shortcuts`，快捷鍵表（ShortcutHelp）會列在同一個分組：
 *
 *   const shortcuts = [...playbackShortcuts({ toggle, rewind }), …其他快捷鍵];
 *
 * 焦點在文字欄、表單控制項上時不攔截（`useShortcuts` 的規則）；焦點在時間軸上時 Home 由時間軸自己處理（到 0，不暫停）。
 * 工具有自己的措辭或分組時用 `group`、`labels` 覆寫；條件不允許播放時（例如框選中），自己把 handler 包一層。
 * 空白鍵由工具自己處理時（例如 magic-circle：按住拖曳＝平移）不給 `toggle`：空白鍵那一列只列在說明裡、不綁 handler。
 */
import type { Shortcut } from './shortcuts';
import { REWIND_LABEL } from './Transport';

export interface PlaybackShortcutsOptions {
  /** 播放／暫停；不給＝空白鍵只列在說明裡（由工具自己處理） */
  toggle?: () => void;
  /** 回到開頭：暫停並停在第一格 */
  rewind: () => void;
  /** 快捷鍵表裡的分組（預設「播放」） */
  group?: string;
  /** 說明文字（預設「播放／暫停」「回到開頭」） */
  labels?: { toggle?: string; rewind?: string };
}

export function playbackShortcuts({
  toggle,
  rewind,
  group = '播放',
  labels,
}: PlaybackShortcutsOptions): Shortcut[] {
  return [
    {
      keys: 'space',
      label: labels?.toggle ?? '播放／暫停',
      group,
      ...(toggle ? { handler: () => toggle() } : {}),
    },
    { keys: 'home', label: labels?.rewind ?? REWIND_LABEL, group, handler: () => rewind() },
  ];
}
