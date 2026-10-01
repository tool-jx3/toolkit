// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  comboText,
  formatCombo,
  IN_INPUT_BADGE,
  matchCombo,
  type Shortcut,
  ShortcutHelp,
  Toggle,
  useShortcuts,
  withShortcut,
} from '@/ui';

function Harness({ shortcuts }: { shortcuts: Shortcut[] }) {
  useShortcuts(shortcuts);
  return (
    <div>
      <button type="button">一般按鈕</button>
      <Toggle label="格線" checked onCheckedChange={() => {}} />
      <input aria-label="名稱" />
    </div>
  );
}

describe('快捷鍵', () => {
  it('單鍵快捷鍵：頁面與一般按鈕上觸發，開關與輸入欄上不觸發', () => {
    const g = vi.fn();
    const undo = vi.fn();
    render(
      <Harness
        shortcuts={[
          { keys: 'g', label: '重新產生', handler: g },
          { keys: 'mod+z', label: '復原', handler: undo },
        ]}
      />,
    );
    fireEvent.keyDown(document.body, { key: 'G', shiftKey: true });
    expect(g).not.toHaveBeenCalled(); // 大寫 G（Shift）不是 g
    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(screen.getByRole('button', { name: '一般按鈕' }), { key: 'g' });
    expect(g).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('switch', { name: '格線' }), { key: 'g' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '名稱' }), { key: 'g' });
    expect(g).toHaveBeenCalledTimes(2);
    /* 有修飾鍵的快捷鍵在開關上仍然有效，在文字欄裡讓給瀏覽器 */
    fireEvent.keyDown(screen.getByRole('switch', { name: '格線' }), { key: 'z', ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '名稱' }), { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('按鍵比對與顯示文字', () => {
    const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    expect(matchCombo(ev({ key: '?', shiftKey: true }), '?', false)).toBe(true);
    expect(matchCombo(ev({ key: 'z', metaKey: true }), 'mod+z', true)).toBe(true);
    expect(matchCombo(ev({ key: 'z', ctrlKey: true }), 'mod+z', true)).toBe(false);
    expect(matchCombo(ev({ key: 'Z', ctrlKey: true, shiftKey: true }), 'shift+mod+z', false)).toBe(
      true,
    );
    expect(matchCombo(ev({ key: ' ' }), 'space', false)).toBe(true);
    expect(formatCombo('shift+mod+z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(formatCombo('mod+z', true)).toEqual(['⌘', 'Z']);
    expect(formatCombo('arrowleft', false)).toEqual(['←']);
  });

  it('按鈕提示的快捷鍵文字：Mac 顯示 ⌘，其他平台 Ctrl（message-box F76）', () => {
    expect(comboText('mod+z', false)).toBe('Ctrl＋Z');
    expect(comboText('shift+mod+z', false)).toBe('Ctrl＋Shift＋Z');
    expect(comboText('mod+y', false)).toBe('Ctrl＋Y');
    expect(comboText('mod+z', true)).toBe('⌘Z');
    expect(comboText('shift+mod+z', true)).toBe('⇧⌘Z');
    expect(comboText('alt+shift+mod+z', true)).toBe('⌥⇧⌘Z');
    expect(withShortcut('復原', 'mod+z', false)).toBe('復原（Ctrl＋Z）');
    expect(withShortcut('復原', 'mod+z', true)).toBe('復原（⌘Z）');
    expect(withShortcut('重做', 'mod+y', true)).toBe('重做（⌘Y）');
  });

  it('沒指定平台時依 navigator.platform 判斷', () => {
    const spy = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(withShortcut('復原', 'mod+z')).toBe('復原（⌘Z）');
    spy.mockReturnValue('Win32');
    expect(withShortcut('復原', 'mod+z')).toBe('復原（Ctrl＋Z）');
    spy.mockRestore();
  });

  it('allowInInput 的 Ctrl／⌘＋Enter：文字欄、開關、按鈕上都觸發；沒有 allowInInput 的照舊讓給按鈕', () => {
    const toggle = vi.fn();
    const other = vi.fn();
    render(
      <Harness
        shortcuts={[
          { keys: 'mod+shift+enter', label: '切換編號', handler: toggle, allowInInput: true },
          { keys: 'mod+enter', label: '匯出', handler: other },
        ]}
      />,
    );
    const combo = { key: 'Enter', ctrlKey: true, shiftKey: true };
    fireEvent.keyDown(screen.getByRole('textbox', { name: '名稱' }), combo);
    fireEvent.keyDown(screen.getByRole('switch', { name: '格線' }), combo);
    const button = screen.getByRole('button', { name: '一般按鈕' });
    expect(fireEvent.keyDown(button, combo)).toBe(false); // preventDefault：不會按到按鈕
    fireEvent.keyDown(document.body, combo);
    expect(toggle).toHaveBeenCalledTimes(4);
    /* 向下相容：沒有 allowInInput 的 Ctrl＋Enter 在按鈕上仍讓給按鈕，在頁面上照常 */
    expect(fireEvent.keyDown(button, { key: 'Enter', ctrlKey: true })).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    expect(other).toHaveBeenCalledTimes(1);
    /* 不帶修飾鍵的 Enter 在按鈕上一律讓給按鈕 */
    const plain = vi.fn();
    render(
      <Harness
        shortcuts={[{ keys: 'enter', label: '確定', handler: plain, allowInInput: true }]}
      />,
    );
    fireEvent.keyDown(screen.getAllByRole('button', { name: '一般按鈕' })[1], { key: 'Enter' });
    expect(plain).not.toHaveBeenCalled();
  });

  it('ShortcutHelp：allowInInput 的組合標示「輸入框裡也可用」，開頭說明跟著改；沒有時與以前相同', () => {
    const { unmount } = render(
      <ShortcutHelp
        open
        onOpenChange={() => {}}
        shortcuts={[
          { keys: 'mod+shift+o', label: '選擇圖片', allowInInput: true },
          { keys: 'escape', label: '重設' },
        ]}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: '快捷鍵' });
    expect(dialog).toHaveTextContent(`標示「${IN_INPUT_BADGE}」的在輸入框裡照樣作用`);
    const marked = dialog.querySelectorAll('[data-in-input]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent(`選擇圖片${IN_INPUT_BADGE}`);
    expect(screen.getAllByText(IN_INPUT_BADGE)).toHaveLength(1);
    unmount();
    render(
      <ShortcutHelp open onOpenChange={() => {}} shortcuts={[{ keys: 'mod+z', label: '復原' }]} />,
    );
    expect(screen.getByRole('dialog', { name: '快捷鍵' })).toHaveTextContent(
      '在輸入框裡打字時，大部分快捷鍵不會作用。',
    );
    expect(screen.queryByText(IN_INPUT_BADGE)).toBeNull();
  });
});
