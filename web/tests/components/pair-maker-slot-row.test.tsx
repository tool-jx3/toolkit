// @vitest-environment jsdom
/**
 * pair-maker 存檔槽的一列：名稱欄正在輸入時，清單重讀（上一次改名寫完）不會蓋掉打到一半的字；
 * 沒有在輸入時跟著存檔槽的名稱換。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlotRow } from '@/tools/pair-maker/SlotsDialog';
import type { SlotRecord } from '@/tools/pair-maker/slots';

const rec = (name: string): SlotRecord =>
  ({
    id: 's1',
    templateId: 't',
    name,
    data: {},
    preview: null,
    savedAt: 0,
  }) as unknown as SlotRecord;

function setup() {
  const onRename = vi.fn();
  const onOverwrite = vi.fn();
  const props = { onRename, onOverwrite, onLoad: vi.fn(), onRemove: vi.fn() };
  const view = render(<SlotRow r={rec('雙人資料卡')} {...props} />);
  const input = screen.getByRole('textbox', { name: '存檔槽名稱' }) as HTMLInputElement;
  const rerender = (name: string) => view.rerender(<SlotRow r={rec(name)} {...props} />);
  return { input, rerender, onRename, onOverwrite };
}

describe('SlotRow 的名稱欄', () => {
  it('輸入中清單重讀：打到一半的字留著，按「覆蓋」帶著新名稱', () => {
    const { input, rerender, onRename, onOverwrite } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '第一版' } });
    rerender('存檔槽');
    expect(input.value).toBe('第一版');
    fireEvent.blur(input);
    expect(onRename).toHaveBeenLastCalledWith('第一版');
    fireEvent.click(screen.getByRole('button', { name: '覆蓋' }));
    expect(onOverwrite).toHaveBeenLastCalledWith('第一版');
  });

  it('沒有在輸入時跟著存檔槽的名稱換', () => {
    const { input, rerender } = setup();
    rerender('另一個名稱');
    expect(input.value).toBe('另一個名稱');
  });
});
