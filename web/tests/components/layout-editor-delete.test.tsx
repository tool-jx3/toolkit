// @vitest-environment jsdom
/**
 * LayoutEditor 的 Delete／Backspace（screenshot-fx 第一批驗證後修正）：焦點在表單控制項（文字欄、選單、滑桿、
 * 開關、勾選、數字欄…）上時不刪（contentEditable 本來就避開，見 isEditableTarget）；在頁面、物件本身、一般按鈕上照常刪；標了 data-shortcuts="pass" 的控制項把按鍵讓給工具。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutEditor, SHORTCUTS_PASS } from '@/ui';

const items = [{ id: 'a', label: '框 A', box: { x: 10, y: 10, width: 40, height: 40 } }];

function setup() {
  const onDelete = vi.fn();
  const onSelect = vi.fn();
  render(
    <>
      <input aria-label="文字" />
      <input aria-label="範圍" type="range" />
      <input aria-label="勾選" type="checkbox" />
      <select aria-label="選單">
        <option>一</option>
      </select>
      <textarea aria-label="多行" />
      <span role="slider" aria-label="滑桿" aria-valuenow={1} tabIndex={0} />
      <button type="button" role="switch" aria-checked="false" aria-label="開關" />
      <span role="spinbutton" aria-label="數字" aria-valuenow={1} tabIndex={0} />
      <button type="button">一般按鈕</button>
      <span
        role="slider"
        aria-label="讓出的滑桿"
        aria-valuenow={1}
        tabIndex={0}
        {...SHORTCUTS_PASS}
      />
      <LayoutEditor
        width={100}
        height={100}
        items={items}
        selectedId="a"
        onSelect={onSelect}
        onChange={vi.fn()}
        onDelete={onDelete}
      />
    </>,
  );
  return { onDelete, onSelect };
}

describe('LayoutEditor：Delete／Backspace 與表單控制項', () => {
  it('表單控制項上不刪（Delete 與 Backspace 都是）', () => {
    const { onDelete, onSelect } = setup();
    const targets = [
      screen.getByRole('textbox', { name: '文字' }),
      screen.getByRole('slider', { name: '範圍' }),
      screen.getByRole('checkbox', { name: '勾選' }),
      screen.getByRole('combobox', { name: '選單' }),
      screen.getByRole('textbox', { name: '多行' }),
      screen.getByRole('slider', { name: '滑桿' }),
      screen.getByRole('switch', { name: '開關' }),
      screen.getByRole('spinbutton', { name: '數字' }),
    ];
    for (const t of targets) {
      fireEvent.keyDown(t, { key: 'Delete' });
      fireEvent.keyDown(t, { key: 'Backspace' });
    }
    expect(onDelete).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('頁面、物件本身、一般按鈕、讓出按鍵的控制項上照常刪', () => {
    const { onDelete } = setup();
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.querySelector('[data-layout-item="a"]') as HTMLElement, {
      key: 'Backspace',
    });
    fireEvent.keyDown(screen.getByRole('button', { name: '一般按鈕' }), { key: 'Delete' });
    fireEvent.keyDown(screen.getByRole('slider', { name: '讓出的滑桿' }), { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledTimes(4);
    expect(onDelete).toHaveBeenLastCalledWith('a');
  });
});
