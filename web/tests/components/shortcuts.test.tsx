// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatCombo, matchCombo, type Shortcut, Toggle, useShortcuts } from '@/ui';

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
});
