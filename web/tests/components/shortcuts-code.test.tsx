// @vitest-environment jsdom
/**
 * 快捷鍵的實體按鍵位置寫法（`code:`）：Mac 的 Option＋數字產生特殊字元（event.key 是「¡」），
 * 用 event.code 比對才能和 Windows 的 Alt＋數字共用（scenario-cards 移植時新增）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { comboText, formatCombo, matchCombo, type Shortcut, useShortcuts } from '@/ui';

const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

function Harness({ shortcuts }: { shortcuts: Shortcut[] }) {
  useShortcuts(shortcuts);
  return <textarea aria-label="內文" />;
}

describe('快捷鍵：實體按鍵位置', () => {
  it('比對 event.code，不看產生的字元', () => {
    /* Windows／Linux 的 Alt＋1 */
    expect(
      matchCombo(ev({ key: '1', code: 'Digit1', altKey: true }), 'alt+code:digit1', false),
    ).toBe(true);
    /* Mac 的 Option＋1 會產生「¡」 */
    expect(
      matchCombo(ev({ key: '¡', code: 'Digit1', altKey: true }), 'alt+code:digit1', true),
    ).toBe(true);
    expect(matchCombo(ev({ key: '–', code: 'Minus', altKey: true }), 'alt+code:minus', true)).toBe(
      true,
    );
    /* 原本的字元寫法在 Mac 上對不上 */
    expect(matchCombo(ev({ key: '¡', code: 'Digit1', altKey: true }), 'alt+1', true)).toBe(false);
    /* 修飾鍵、Shift 都要相符；數字鍵盤不是同一個位置 */
    expect(matchCombo(ev({ key: '1', code: 'Digit1' }), 'alt+code:digit1', false)).toBe(false);
    expect(
      matchCombo(
        ev({ key: '!', code: 'Digit1', altKey: true, shiftKey: true }),
        'alt+code:digit1',
        false,
      ),
    ).toBe(false);
    expect(
      matchCombo(ev({ key: '1', code: 'Numpad1', altKey: true }), 'alt+code:digit1', false),
    ).toBe(false);
    expect(
      matchCombo(
        ev({ key: '1', code: 'Digit1', altKey: true, ctrlKey: true }),
        'alt+code:digit1',
        false,
      ),
    ).toBe(false);
  });

  it('顯示文字照美式鍵盤的字樣', () => {
    expect(formatCombo('alt+code:digit1', false)).toEqual(['Alt', '1']);
    expect(formatCombo('alt+code:minus', true)).toEqual(['⌥', '-']);
    expect(formatCombo('alt+code:equal', false)).toEqual(['Alt', '=']);
    expect(formatCombo('mod+code:keyk', false)).toEqual(['Ctrl', 'K']);
    expect(formatCombo('code:arrowup', false)).toEqual(['↑']);
    expect(comboText('alt+code:digit0', false)).toBe('Alt＋0');
    expect(comboText('shift+alt+code:digit9', true)).toBe('⌥⇧9');
  });

  it('useShortcuts：allowInInput 的實體按鍵快捷鍵在文字欄裡也觸發', () => {
    const handler = vi.fn();
    render(
      <Harness
        shortcuts={[{ keys: 'alt+code:digit2', label: '選第 2 種', allowInInput: true, handler }]}
      />,
    );
    const ta = screen.getByRole('textbox', { name: '內文' });
    const notCancelled = fireEvent.keyDown(ta, { key: '™', code: 'Digit2', altKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
    fireEvent.keyDown(ta, { key: '2', code: 'Digit2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
